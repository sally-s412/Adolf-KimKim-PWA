"""Private story effects. Existing Firestore friendship rules gate every read."""
import asyncio
import base64
import binascii
import hashlib
import io
import json
import math
import re
import time
import wave
import warnings
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool
from routes import profile_media as profile
from routes.social_media import record
from routes.chat_media import provider_upload, string

router = APIRouter(prefix='/api/story-media', tags=['story-media'])
MAX_BUNDLE = 6 * 1024 * 1024

def invalid():
    raise HTTPException(422, 'story/invalid-composition')

def data_bytes(value, mime, limit):
    prefix = 'data:' + mime + ';base64,'
    if not isinstance(value, str) or not value.startswith(prefix) or len(value) > limit * 1.4 + 100:
        invalid()
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
    except (ValueError, binascii.Error):
        invalid()
    if not raw or len(raw) > limit:
        invalid()
    return raw

def geometry(item):
    out = {}
    for name in ('x', 'y', 'w', 'h'):
        value = item.get(name)
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            invalid()
        out[name] = value
    if out['w'] < .01 or out['h'] < .01:
        invalid()
    rotation = item.get('rotation', 0)
    if type(rotation) not in (int, float) or not math.isfinite(rotation) or not -45 <= rotation <= 45: invalid()
    out['rotation'] = rotation
    return out

def validate_manifest(value):
    if not isinstance(value, dict) or value.get('version') != 1:
        invalid()
    gifs, links = value.get('gifs', []), value.get('links', [])
    if not isinstance(gifs, list) or not isinstance(links, list) or len(gifs) > 3 or len(links) > 12:
        invalid()
    result = {'version': 1, 'duration': 15, 'gifs': [], 'links': []}
    for item in gifs:
        if not isinstance(item, dict): invalid()
        raw = data_bytes(item.get('src'), 'image/gif', 500_000)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as im:
                    if im.format != 'GIF' or im.width * im.height * im.n_frames > 25_000_000 or im.n_frames > 120:
                        invalid()
        except (OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
            invalid()
        result['gifs'].append({**geometry(item), 'src': item['src']})
    for item in links:
        if not isinstance(item, dict) or item.get('kind') not in ('mention', 'location'):
            invalid()
        label = item.get('label')
        if not isinstance(label, str) or not 1 <= len(label) <= 80: invalid()
        row = {**geometry(item), 'kind': item['kind'], 'label': label}
        if row['kind'] == 'mention':
            uid = item.get('uid')
            if not isinstance(uid, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', uid): invalid()
            row['uid'] = uid
        result['links'].append(row)
    audio = value.get('audio')
    if audio is not None:
        if not isinstance(audio, dict): invalid()
        raw = data_bytes(audio.get('src'), 'audio/wav', 700_000)
        try:
            with wave.open(io.BytesIO(raw), 'rb') as wav:
                if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 22050 or not 1 <= wav.getnframes() <= 330750:
                    invalid()
                if len(wav.readframes(wav.getnframes())) != wav.getnframes() * 2: invalid()
        except (wave.Error, EOFError): invalid()
        name = audio.get('name', '')
        if not isinstance(name, str) or len(name) > 100: invalid()
        result['audio'] = {'name': name, 'src': audio['src']}
    return result

async def upload_manifest(cloud, key, secret, public_id, raw):
    params = {'public_id': public_id, 'timestamp': str(int(time.time())), 'type': 'authenticated', 'overwrite': 'false', 'backup': 'false'}
    signature = hashlib.sha1(('&'.join(f'{k}={v}' for k,v in sorted(params.items())) + secret).encode()).hexdigest()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f'https://api.cloudinary.com/v1_1/{cloud}/raw/upload', data={**params, 'api_key': key, 'signature': signature}, files={'file': ('story.json', raw, 'application/json')})
    if r.status_code >= 400 or r.json().get('public_id') != public_id or r.json().get('type') != 'authenticated':
        raise HTTPException(502, 'story/provider-unavailable')

@router.post('/{owner}/{post}')
async def upload(owner: str, post: str, request: Request):
    cloud, key, secret = profile.settings()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            uid, doc = await record(request, owner, post, client)
        if uid != owner or string(doc, 'kind') != 'story' or doc.get('published', {}).get('booleanValue') is not False:
            raise HTTPException(403, 'story/not-owner-draft')
        raw = bytearray()
        async with asyncio.timeout(20):
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw) > MAX_BUNDLE: raise HTTPException(413, 'story/too-large')
        try: payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError): invalid()
        if not isinstance(payload, dict): invalid()
        manifest = await run_in_threadpool(validate_manifest, payload.get('manifest'))
        poster = data_bytes(payload.get('poster'), 'image/jpeg', profile.MAX_BYTES)
        image = await run_in_threadpool(profile.normalize_image, poster, 'chat')
        profile.reserve_upload(uid)
        public_id = f'kimkim/social/{uid}/{post}'
        async with asyncio.timeout(65):
            await upload_manifest(cloud, key, secret, public_id + '.json', json.dumps(manifest, separators=(',', ':')).encode())
            await provider_upload(cloud, key, secret, public_id, image)
        return {'mediaId': public_id}
    except (TimeoutError, httpx.TimeoutException): raise HTTPException(504, 'story/upload-timeout')
    except httpx.HTTPError: raise HTTPException(502, 'story/provider-unavailable')

@router.get('/{owner}/{post}')
async def read(owner: str, post: str, request: Request):
    cloud, _, secret = profile.settings()
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            _, data = await record(request, owner, post, client)
            public_id = f'kimkim/social/{owner}/{post}'
            if string(data, 'kind') != 'story' or string(data, 'mediaId') != public_id:
                raise HTTPException(404, 'story/not-found')
            path = public_id + '.json'
            sig = base64.urlsafe_b64encode(hashlib.sha1((path + secret).encode()).digest()).decode()[:8]
            async with client.stream('GET', f'https://res.cloudinary.com/{cloud}/raw/authenticated/s--{sig}--/{quote(path,safe="/")}') as r:
                if r.status_code == 404: raise HTTPException(404, 'story/not-found')
                if r.status_code != 200: raise HTTPException(502, 'story/provider-unavailable')
                raw = bytearray()
                async for chunk in r.aiter_bytes():
                    raw.extend(chunk)
                    if len(raw) > MAX_BUNDLE: raise HTTPException(502, 'story/provider-unavailable')
            return Response(bytes(raw), media_type='application/json', headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
    except httpx.HTTPError: raise HTTPException(502, 'story/provider-unavailable')
