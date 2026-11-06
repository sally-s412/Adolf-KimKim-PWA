"""Private scheduled letters. Delivery requires configured Firestore and mail provider.

Global records are inaccessible to Firebase clients under the existing deny rule.
Content is encrypted before storage and recipients receive a random bearer link.
A trusted external scheduler calls /dispatch even when the web service sleeps.
"""
import base64
import hashlib
import html
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from google.oauth2.credentials import Credentials as UserCredentials
from functools import lru_cache
from urllib.parse import quote, urlsplit

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.service_account import Credentials
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .profile_media import authenticate, CERT_REQUEST

router = APIRouter(prefix='/api/capsules', tags=['capsules'])
public_router = APIRouter()
COLLECTION = 'kimkimCapsules'


class CapsuleAccessLogFilter(logging.Filter):
    """Do not put private bearer links into the HTTP access log."""
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) >= 3:
            args = list(record.args)
            if isinstance(args[2], str) and '/capsule/open/' in args[2]:
                args[2] = args[2].split('?', 1)[0]
                record.args = tuple(args)
        return True


logging.getLogger('uvicorn.access').addFilter(CapsuleAccessLogFilter())


async def sender_verified(request):
    project = os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim')
    token = request.headers.get('authorization', '')[7:]
    try:
        claims = await run_in_threadpool(id_token.verify_firebase_token,
                                         token, CERT_REQUEST, audience=project)
        return claims.get('email_verified') is True
    except Exception:
        return False



def settings():
    names = ['CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON', 'CAPSULE_ENCRYPTION_KEY',
             'CAPSULE_GMAIL_TOKEN_ENCRYPTED', 'CAPSULE_FROM_EMAIL', 'CAPSULE_PUBLIC_ORIGIN',
             'CAPSULE_DISPATCH_SECRET']
    values = {name: os.getenv(name, '').strip() for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise HTTPException(503, 'capsule/not-configured')
    try:
        key = values['CAPSULE_ENCRYPTION_KEY'].encode()
        Fernet(key)
        account = json.loads(values['CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON'])
        project = os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim')
        if account['project_id'] != project:
            raise ValueError('project')
        origin = urlsplit(values['CAPSULE_PUBLIC_ORIGIN'])
        if origin.scheme != 'https' or origin.path not in ('', '/') or origin.query or origin.fragment:
            raise ValueError('origin')
        if len(values['CAPSULE_DISPATCH_SECRET']) < 32:
            raise ValueError('secret')
        sender = values['CAPSULE_FROM_EMAIL']
        if '\r' in sender or '\n' in sender or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', parseaddr(sender)[1]):
            raise ValueError('sender')
        gmail_token_info(values, Fernet(key))
        return values, account, Fernet(key)
    except Exception:
        raise HTTPException(503, 'capsule/not-configured')


GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'


def gmail_token_info(values, cipher):
    # No plaintext token is accepted from a request or returned to the frontend.
    info = json.loads(cipher.decrypt(values['CAPSULE_GMAIL_TOKEN_ENCRYPTED'].encode()))
    if info.get('token_uri') != 'https://oauth2.googleapis.com/token':
        raise ValueError('token endpoint')
    if not all(isinstance(info.get(key), str) and info[key] for key in
               ('refresh_token', 'client_id', 'client_secret')):
        raise ValueError('credentials')
    if set(info.get('scopes', [])) != {GMAIL_SCOPE}:
        raise ValueError('send-only permission required')
    return info


def gmail_access_token(values, cipher):
    try:
        info = gmail_token_info(values, cipher)
        credential = UserCredentials.from_authorized_user_info(info, scopes=[GMAIL_SCOPE])
        # Reuse only the access token in memory. No token file is written on Render.
        if not credential.valid:
            credential.refresh(GoogleRequest())
        if not credential.token:
            raise ValueError('missing access token')
        return credential.token
    except Exception:
        raise HTTPException(503, 'capsule/gmail-authorization-required') from None


@lru_cache(maxsize=1)
def admin_credentials(serialized):
    return Credentials.from_service_account_info(json.loads(serialized), scopes=[
        'https://www.googleapis.com/auth/datastore'])


def admin_token():
    _, account, _ = settings()
    credential = admin_credentials(json.dumps(account, sort_keys=True))
    if not credential.valid:
        credential.refresh(GoogleRequest())
    return credential.token


def base_url():
    project = os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim')
    return f'https://firestore.googleapis.com/v1/projects/{quote(project, safe="")}/databases/(default)/documents'


async def firestore(method, path, **kwargs):
    token = await run_in_threadpool(admin_token)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(method, base_url() + path,
                                        headers={'Authorization': 'Bearer ' + token}, **kwargs)
    if response.status_code in (409, 412) or (path == ':commit' and response.status_code == 400 and response.json().get('error', {}).get('status') == 'FAILED_PRECONDITION'):
        raise HTTPException(409, 'capsule/state-changed')
    if response.status_code == 404:
        return None
    if not response.is_success:
        raise HTTPException(503, 'capsule/storage-unavailable')
    return response.json() if response.content else {}


def fields(record):
    return {key: {'stringValue': str(value)} for key, value in record.items()}


def unpack(document):
    if not document:
        return None
    data = {key: value.get('stringValue', '') for key, value in document['fields'].items()}
    data['id'] = document['name'].rsplit('/', 1)[-1]
    data['version'] = document['updateTime']
    return data


def public_meta(record):
    result = {key: record.get(key, '') for key in ('id', 'draftId', 'title', 'email', 'sendAt', 'status', 'errorCode', 'cover')}
    # Owner-authenticated endpoints only. Photo covers stay encrypted at rest.
    if record.get('cover') == 'photo' and record.get('encrypted'):
        payload = json.loads(settings()[2].decrypt(record['encrypted'].encode()))
        result['coverPhoto'] = (payload.get('photos') or [''])[0]
    return result


def record_path(uid, draft_id):
    digest = hashlib.sha256((uid + ':' + draft_id).encode()).hexdigest()
    return '/' + COLLECTION + '/' + digest


async def update(record, changes):
    params = [('updateMask.fieldPaths', key) for key in changes]
    params.append(('currentDocument.updateTime', record['version']))
    return unpack(await firestore('PATCH', '/' + COLLECTION + '/' + record['id'],
                                  params=params, json={'fields': fields(changes)}))


class Letter(BaseModel):
    id: str = Field(min_length=10, max_length=100, pattern=r'^[a-zA-Z0-9-]+$')
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=12000)
    email: str = Field(max_length=254)
    sendAt: str
    language: str = Field(default='vi', pattern=r'^(vi|en)$')
    photos: list[str] = Field(default_factory=list, max_length=3)
    cover: str = Field(default='rose', pattern=r'^(rose|midnight|lavender|meadow|sunset|paper|photo)$')


def validate_letter(letter):
    if not letter.title.strip() or not letter.body.strip():
        raise HTTPException(422, 'capsule/invalid-letter')
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', letter.email):
        raise HTTPException(422, 'capsule/invalid-email')
    try:
        when = datetime.fromisoformat(letter.sendAt.replace('Z', '+00:00'))
        if when.tzinfo is None or when.timestamp() < time.time() + 60:
            raise ValueError('date')
    except (ValueError, OverflowError):
        raise HTTPException(422, 'capsule/invalid-date')
    if letter.cover == 'photo' and not letter.photos:
        raise HTTPException(422, 'capsule/cover-photo-required')
    for photo in letter.photos:
        if not photo.startswith('data:image/jpeg;base64,'):
            raise HTTPException(422, 'capsule/invalid-photo')
        try:
            raw = base64.b64decode(photo.split(',', 1)[1], validate=True)
            if not raw.startswith(b'\xff\xd8\xff'):
                raise ValueError('jpeg')
        except ValueError:
            raise HTTPException(422, 'capsule/invalid-photo')
    if len(letter.model_dump_json().encode()) > 420000:
        raise HTTPException(413, 'capsule/too-large')
    return when.astimezone(timezone.utc).isoformat(timespec='seconds')


@router.get('/capabilities')
async def capabilities(request: Request):
    await authenticate(request)
    try:
        settings()
        if os.getenv('CAPSULE_SCHEDULER_ENABLED') != 'true':
            return {'ready': False}
        return {'ready': True, 'emailVerified': await sender_verified(request)}
    except HTTPException:
        return {'ready': False}


@router.post('/seal')
async def seal(letter: Letter, request: Request):
    uid = await authenticate(request)
    values, _, cipher = settings()
    if not await sender_verified(request):
        raise HTTPException(403, 'capsule/verify-email')
    path = record_path(uid, letter.id)
    previous = unpack(await firestore('GET', path))
    if previous:
        return public_meta(previous)  # Retry after a lost response must never create another mail.
    if os.getenv('CAPSULE_SCHEDULER_ENABLED') != 'true':
        raise HTTPException(503, 'capsule/not-configured')
    send_at = validate_letter(letter)
    # Quota spans all historical letters and is intentionally conservative for beta.
    existing = await query_records('owner', uid, 101)
    if len(existing) >= 100:
        raise HTTPException(429, 'capsule/limit-reached')
    token = secrets.token_urlsafe(32)
    payload = {**letter.model_dump(), 'token': token}
    record = {'owner': uid, 'draftId': letter.id, 'title': letter.title.strip(), 'email': letter.email.strip(),
              'sendAt': send_at, 'status': 'scheduled', 'createdAt': datetime.now(timezone.utc).isoformat(),
              'retrySince': '', 'encrypted': cipher.encrypt(json.dumps(payload).encode()).decode(),
              'tokenHash': hashlib.sha256(token.encode()).hexdigest(), 'attempts': '0', 'cover': letter.cover}
    draft_path = '/users/' + quote(uid, safe='') + '/capsuleDrafts/' + letter.id
    draft = await firestore('GET', draft_path)
    if not draft:
        raise HTTPException(409, 'capsule/draft-changed')
    saved = draft.get('fields', {})
    # A preview seals exactly the revision it displayed, including images.
    expected = {'title': letter.title, 'body': letter.body, 'email': letter.email,
                'sendAt': letter.sendAt}
    if any(saved.get(key, {}).get('stringValue') != value for key, value in expected.items()):
        raise HTTPException(409, 'capsule/draft-changed')
    if saved.get('cover', {}).get('stringValue', 'rose') != letter.cover:
        raise HTTPException(409, 'capsule/draft-changed')
    photos = [value.get('stringValue') for value in
              saved.get('photos', {}).get('arrayValue', {}).get('values', [])]
    if photos != letter.photos:
        raise HTTPException(409, 'capsule/draft-changed')
    name = base_url().split('/v1/', 1)[1] + path
    try:
        await firestore('POST', ':commit', json={'writes': [
            {'update': {'name': name, 'fields': fields(record)},
             'currentDocument': {'exists': False}},
            {'delete': draft['name'],
             'currentDocument': {'updateTime': draft['updateTime']}}
        ]})
    except HTTPException as error:
        if error.status_code != 409:
            raise
        previous = unpack(await firestore('GET', path))
        if previous:
            return public_meta(previous)
        raise HTTPException(409, 'capsule/draft-changed')
    return public_meta({'id': path.rsplit('/', 1)[-1], **record})



async def query_records(field, value, limit=100):
    result = await firestore('POST', ':runQuery', json={'structuredQuery': {
        'from': [{'collectionId': COLLECTION}],
        'where': {'fieldFilter': {'field': {'fieldPath': field}, 'op': 'EQUAL', 'value': {'stringValue': value}}},
        'limit': limit}})
    return [unpack(row['document']) for row in (result or []) if 'document' in row]


@router.get('')
async def list_letters(request: Request):
    uid = await authenticate(request)
    records = await query_records('owner', uid)
    return {'items': sorted([public_meta(r) for r in records], key=lambda r: r['sendAt'], reverse=True)}


@router.post('/{letter_id}/cancel')
async def cancel(letter_id: str, request: Request):
    uid = await authenticate(request)
    if not re.fullmatch('[a-f0-9]{64}', letter_id):
        raise HTTPException(404, 'capsule/not-found')
    record = unpack(await firestore('GET', '/' + COLLECTION + '/' + letter_id))
    if not record or record['owner'] != uid:
        raise HTTPException(404, 'capsule/not-found')
    if record['status'] == 'cancelled':
        return public_meta(record)
    if record['status'] != 'scheduled':
        raise HTTPException(409, 'capsule/already-sending')
    # Compare-and-swap ensures cancellation cannot race a worker that claimed delivery.
    return public_meta(await update(record, {'status': 'cancelled'}))


async def deliver(record):
    values, _, cipher = settings()
    payload = json.loads(cipher.decrypt(record['encrypted'].encode()))
    link = values['CAPSULE_PUBLIC_ORIGIN'].rstrip('/') + '/capsule/open/' + record['id'] + '?token=' + quote(payload['token'])
    vi = payload['language'] == 'vi'
    heading = 'KimKim mang thư đến cho bạn' if vi else 'KimKim has a letter for you'
    label = 'Mở KimKim Capsule' if vi else 'Open KimKim Capsule'
    text = 'Một lời nhắn đã được gửi đến tương lai, dành cho bạn.' if vi else 'A letter was sent into the future, just for you.'
    # Private letter body and photographs are only revealed on the recipient page.
    mail = {'from': values['CAPSULE_FROM_EMAIL'], 'to': [record['email']],
            'subject': heading + ' · ' + record['title'],
            'text': heading + '\n' + text + '\n' + link,
            'html': '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;background:#fff7f8;color:#231a45"><p>KIMKIM CAPSULE</p><h1>' + heading + '</h1><p>' + text + '</p><p>' + html.escape(record['title']) + '</p><a style="display:inline-block;background:#c93f5e;color:white;padding:14px 20px;border-radius:12px;text-decoration:none" href="' + html.escape(link, quote=True) + '">' + label + '</a></div>'}
    message = EmailMessage()
    message['From'] = mail['from']
    message['To'] = record['email']
    message['Subject'] = mail['subject'].replace('\r', ' ').replace('\n', ' ')
    message['Message-ID'] = '<kimkim-capsule-' + record['id'] + '@' + parseaddr(mail['from'])[1].split('@')[1] + '>'
    message.set_content(mail['text'])
    message.add_alternative(mail['html'], subtype='html')
    token = await run_in_threadpool(gmail_access_token, values, cipher)
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            headers={'Authorization': 'Bearer ' + token},
            json={'raw': base64.urlsafe_b64encode(message.as_bytes()).decode()})
    if response.status_code in (401, 403):
        raise HTTPException(502, 'capsule/gmail-authorization-required')
    if 400 <= response.status_code < 500:
        raise HTTPException(502, 'capsule/gmail-send-rejected')
    if not response.is_success or not response.json().get('id'):
        raise RuntimeError('capsule/delivery-unknown')
    return response.json()['id']



async def due_records(status, now):
    result = await firestore('POST', ':runQuery', json={'structuredQuery': {
        'from': [{'collectionId': COLLECTION}],
        'where': {'compositeFilter': {'op': 'AND', 'filters': [
            {'fieldFilter': {'field': {'fieldPath': 'status'}, 'op': 'EQUAL',
                             'value': {'stringValue': status}}},
            {'fieldFilter': {'field': {'fieldPath': 'sendAt'}, 'op': 'LESS_THAN_OR_EQUAL',
                             'value': {'stringValue': now.isoformat(timespec='seconds')}}}
        ]}},
        'orderBy': [{'field': {'fieldPath': 'sendAt'}, 'direction': 'ASCENDING'}],
        'limit': 50}})
    return [unpack(row['document']) for row in (result or []) if 'document' in row]


@router.post('/dispatch')
async def dispatch(request: Request):
    values, _, cipher = settings()
    provided = request.headers.get('x-capsule-secret', '')
    if not secrets.compare_digest(provided, values['CAPSULE_DISPATCH_SECRET']):
        raise HTTPException(401, 'capsule/invalid-scheduler')
    # Authenticated preflight never claims jobs or sends mail, even with due letters.
    if getattr(request, 'query_params', {}).get('dry_run') == 'true':
        await run_in_threadpool(gmail_access_token, values, cipher)
        now = datetime.now(timezone.utc)
        await due_records('scheduled', now)
        await due_records('sending', now)
        return {'ready': True, 'dryRun': True, 'sent': 0,
                'schedulerEnabled': os.getenv('CAPSULE_SCHEDULER_ENABLED') == 'true'}
    if os.getenv('CAPSULE_SCHEDULER_ENABLED') != 'true':
        raise HTTPException(503, 'capsule/scheduler-disabled')
    now = datetime.now(timezone.utc)
    records = await due_records('scheduled', now)
    # Gmail has no documented idempotency key. Never re-send a claimed job,
    # including a timeout or a crash after Google accepted the message.
    interrupted = await due_records('sending', now)
    for record in interrupted:
        if (now - datetime.fromisoformat(record['claimedAt'])).total_seconds() >= 600:
            try:
                await update(record, {'status': 'delivery_unknown', 'errorCode': 'capsule/delivery-unknown'})
            except HTTPException:
                pass
    count = 0
    failed = 0
    unknown = 0
    for record in records:
        if datetime.fromisoformat(record['sendAt']) > now:
            continue
        try:
            claim = {'status': 'sending', 'claimedAt': now.isoformat(), 'attempts': str(int(record['attempts']) + 1),
                     'retrySince': record.get('retrySince') or now.isoformat()}
            record = await update(record, claim)
        except HTTPException as error:
            if error.status_code == 409:
                continue
            raise
        try:
            provider_id = await deliver(record)
            await update(record, {'status': 'sent', 'providerId': provider_id, 'sentAt': now.isoformat()})
            count += 1
        except Exception as error:
            definite = isinstance(error, HTTPException) and error.detail in (
                'capsule/gmail-authorization-required', 'capsule/gmail-send-rejected')
            if definite:
                failed += 1
            else:
                unknown += 1
            try:
                await update(record, {'status': 'failed' if definite else 'delivery_unknown',
                    'errorCode': error.detail if definite else 'capsule/delivery-unknown'})
            except Exception:
                pass  # A later dispatch quarantines this claim; it never sends it again.
            continue
    return {'sent': count, 'failed': failed, 'deliveryUnknown': unknown}


@public_router.get('/capsule/open/{letter_id}', response_class=HTMLResponse)
async def open_letter(letter_id: str, token: str = ''):
    if not re.fullmatch('[a-f0-9]{64}', letter_id) or not 30 <= len(token) <= 100:
        raise HTTPException(404, 'Letter not found')
    record = unpack(await firestore('GET', '/' + COLLECTION + '/' + letter_id))
    if not record or not secrets.compare_digest(record['tokenHash'], hashlib.sha256(token.encode()).hexdigest()):
        raise HTTPException(404, 'Letter not found')
    if record['status'] != 'sent' or datetime.fromisoformat(record['sendAt']) > datetime.now(timezone.utc):
        raise HTTPException(404, 'Letter not available')
    payload = json.loads(settings()[2].decrypt(record['encrypted'].encode()))
    images = ''.join('<img alt="" src="' + html.escape(photo, quote=True) + '">' for photo in payload['photos'])
    palettes = {'rose': ('#f7c4d1','#e3c8ea'), 'midnight': ('#182856','#5b4b83'),
                'lavender': ('#d8ccf5','#a9bce9'), 'meadow': ('#b6d8cd','#e6e3b8'),
                'sunset': ('#f4b3a2','#e9c2de'), 'paper': ('#eee1cc','#d5bea2')}
    cover = payload.get('cover', 'rose')
    a, b = palettes.get(cover, palettes['rose'])
    cover_html = ('<div class="cover"><img alt="" src="' + html.escape(payload['photos'][0], quote=True) + '"></div>') if cover == 'photo' and payload.get('photos') else ('<div class="cover" style="background:linear-gradient(125deg,' + a + ',' + b + ')"><span class="envelope">K</span><span class="cover-brand">KIMKIM · CAPSULE</span></div>')
    content = '<!doctype html><html lang="' + payload['language'] + '"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>KimKim Capsule</title><style>body{margin:0;padding:40px 18px;background:#ffeff2;color:#231a45;font:16px/1.8 system-ui,sans-serif}main{max-width:680px;margin:auto;background:#fffbfc;padding:clamp(24px,6vw,52px);border-radius:24px}h1{line-height:1.25;overflow-wrap:anywhere}.letter{white-space:pre-wrap;overflow-wrap:anywhere}img{display:block;max-width:100%;border-radius:16px;margin-top:20px}small{color:#6a5e8a}.cover{height:220px;position:relative;display:grid;place-items:center;overflow:hidden;border-radius:18px;margin-bottom:32px}.cover img{height:100%;width:100%;object-fit:cover;margin:0;border-radius:0}.envelope{display:grid;place-items:center;width:116px;height:78px;background:#ffffffc9;border:1px solid #ffffffb3;border-radius:10px;box-shadow:0 14px 30px #10183820;color:#98415d;font:italic 32px Georgia}.cover-brand{position:absolute;bottom:18px;color:#231a45;background:#ffffffcc;padding:3px 12px;border-radius:20px;font-size:10px;letter-spacing:2px}@media(prefers-color-scheme:dark){body{background:#101838;color:#f6f2fa}main{background:#192450}small{color:#a9b0d6}}</style><main>' + cover_html + '<small>KIMKIM CAPSULE</small><h1>' + html.escape(payload['title']) + '</h1><div class="letter">' + html.escape(payload['body']) + '</div>' + images + '</main></html>'
    return HTMLResponse(content, headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})
