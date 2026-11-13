"""Send private message push from the existing Render API after a Firestore commit."""
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.service_account import Credentials
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from routes.profile_media import authenticate

router = APIRouter(prefix='/api/message-push', tags=['message-push'])
log = logging.getLogger(__name__)
THREAD = re.compile(r'^(?:g-[a-zA-Z0-9-]{20,80}|[a-zA-Z0-9_-]{1,128}~[a-zA-Z0-9_-]{1,128})$')
MESSAGE = re.compile(r'^[a-zA-Z0-9-]{20,80}$')
SCOPES = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/firebase.messaging']


class Notice(BaseModel):
    threadId: str
    messageId: str


@lru_cache(maxsize=1)
def credentials(raw):
    info = json.loads(raw)
    if info.get('project_id') != os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim'):
        raise ValueError('project mismatch')
    return Credentials.from_service_account_info(info, scopes=SCOPES)


def access_token():
    raw = os.getenv('PUSH_FIREBASE_SERVICE_ACCOUNT_JSON') or os.getenv('CAPSULE_FIREBASE_SERVICE_ACCOUNT_JSON')
    if not raw:
        raise HTTPException(503, 'push/not-configured')
    try:
        credential = credentials(raw)
        if not credential.valid:
            credential.refresh(GoogleRequest())
        return credential.token
    except HTTPException:
        raise
    except Exception:
        log.exception('Push credentials unavailable')
        raise HTTPException(503, 'push/not-configured') from None


def value(doc, key):
    return (doc or {}).get('fields', {}).get(key, {})


def string(doc, key):
    return value(doc, key).get('stringValue', '')


def members(doc):
    return [v.get('stringValue', '') for v in value(doc, 'members').get('arrayValue', {}).get('values', [])]


def timestamp(doc, key):
    raw = value(doc, key).get('timestampValue', '')
    try:
        return datetime.fromisoformat(raw.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return 0


def base():
    return f"https://firestore.googleapis.com/v1/projects/{quote(os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim'), safe='')}/databases/(default)/documents"


async def get(client, token, path):
    r = await client.get(base() + '/' + path, headers={'Authorization': 'Bearer ' + token})
    if r.status_code == 404:
        return None
    if not r.is_success:
        raise HTTPException(503, 'push/storage-unavailable')
    return r.json()


async def devices(client, token, uid):
    r = await client.get(base() + f'/communityPushTokens/{quote(uid, safe="")}/devices',
                         params={'pageSize': 20}, headers={'Authorization': 'Bearer ' + token})
    if r.status_code == 404:
        return []
    if not r.is_success:
        raise HTTPException(503, 'push/storage-unavailable')
    return r.json().get('documents', [])[:20]


async def mark_once(client, token, thread, message):
    # Durable at-most-once marker across Render instances and browser retries.
    key = hashlib.sha256((thread + '/' + message).encode()).hexdigest()
    r = await client.post(base() + '/communityPushDispatch', params={'documentId': key},
                          headers={'Authorization': 'Bearer ' + token},
                          json={'fields': {'threadId': {'stringValue': thread},
                                           'messageId': {'stringValue': message},
                                           'createdAt': {'timestampValue': datetime.now(timezone.utc).isoformat()}}})
    if r.status_code == 409:
        return False
    if not r.is_success:
        raise HTTPException(503, 'push/storage-unavailable')
    return True


@router.post('/notify')
async def notify(payload: Notice, request: Request):
    uid = await authenticate(request)
    thread, message = payload.threadId, payload.messageId
    if not THREAD.fullmatch(thread) or not MESSAGE.fullmatch(message):
        raise HTTPException(422, 'push/invalid-id')
    token = await run_in_threadpool(access_token)
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            record = await get(client, token, f'communityThreads/{thread}/messages/{message}')
            convo = await get(client, token, f'communityThreads/{thread}')
            people = members(convo)
            if not record or string(record, 'senderId') != uid or string(record, 'clientMessageId') != message or uid not in people or not 2 <= len(people) <= 4:
                raise HTTPException(403, 'push/not-sender')
            sent_at = timestamp(record, 'createdAt')
            if not sent_at or abs(time.time() - sent_at) > 300:
                raise HTTPException(409, 'push/message-expired')
            if not await mark_once(client, token, thread, message):
                return {'status': 'already-processed'}
            profile = await get(client, token, f'communityProfiles/{uid}')
            title = (string(profile, 'name') or 'KimKim')[:80]
            for recipient in people:
                if recipient == uid:
                    continue
                left = await get(client, token, f'communityBlocks/{recipient}/targets/{uid}')
                right = await get(client, token, f'communityBlocks/{uid}/targets/{recipient}')
                if left or right:
                    continue
                read = await get(client, token, f'communityThreads/{thread}/receipts/{recipient}')
                if timestamp(read, 'readAt') >= sent_at:
                    continue
                for device in await devices(client, token, recipient):
                    registration = string(device, 'token')
                    if not registration:
                        continue
                    result = await client.post(
                        f"https://fcm.googleapis.com/v1/projects/{quote(os.getenv('FIREBASE_PROJECT_ID', 'adolfkimkim'), safe='')}/messages:send",
                        headers={'Authorization': 'Bearer ' + token},
                        json={'message': {'token': registration,
                                          'data': {'type': 'kimkim-message', 'threadId': thread, 'messageId': message,
                                                   'title': title, 'body': 'Bạn có tin nhắn mới / You have a new message'},
                                          'webpush': {'headers': {'Urgency': 'high'}}}})
                    if result.status_code == 404 or (result.status_code == 400 and 'UNREGISTERED' in result.text):
                        await client.delete('https://firestore.googleapis.com/v1/' + device['name'], headers={'Authorization': 'Bearer ' + token})
                    elif not result.is_success:
                        log.warning('FCM push failed status=%s', result.status_code)
            return {'status': 'ok'}
    except httpx.HTTPError:
        log.exception('Push provider unavailable')
        raise HTTPException(503, 'push/provider-unavailable') from None
