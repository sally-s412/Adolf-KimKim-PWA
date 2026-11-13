"""Small, authenticated API + PWA for the free beta deployment.

No local ONNX/Chromium runtime is loaded by this entrypoint. Token verification
uses Google's public certificates; no Firebase service-account secret is needed.
"""
import os
import asyncio
import time
import re
from collections import OrderedDict, deque

import cachecontrol
import requests
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app import app

PROJECT = os.getenv("FIREBASE_PROJECT_ID", "adolfkimkim")
CERT_REQUEST = GoogleRequest(session=cachecontrol.CacheControl(requests.Session()))
USER_RPM = int(os.getenv("BETA_USER_RPM", "10"))
GLOBAL_RPM = int(os.getenv("BETA_GLOBAL_RPM", "25"))
_buckets = OrderedDict()
_presence = {}
_presence_rate = {}
PRESENCE_TTL = 85
_uid_pattern = re.compile(r'^[a-zA-Z0-9_-]{1,128}$')


@app.post('/api/community/presence')
async def presence_heartbeat(request: Request):
    """Short-lived online signal; never accept a target UID from the client."""
    now = time.monotonic()
    uid = request.state.uid
    recent = [at for at in _presence_rate.get(uid, ()) if at > now - 60]
    if len(recent) >= 4:
        raise HTTPException(429, 'Too many presence updates')
    _presence_rate[uid] = (recent + [now])[-4:]
    _presence[uid] = now + PRESENCE_TTL
    if len(_presence) > 2000:
        for uid, expiry in list(_presence.items()):
            if expiry <= now:
                _presence.pop(uid, None)
                _presence_rate.pop(uid, None)
    return {'online': True}


@app.get('/api/community/presence/{peer}')
async def presence_lookup(peer: str, request: Request):
    own = request.state.uid
    if not _uid_pattern.fullmatch(peer) or peer == own:
        raise HTTPException(404, 'Not found')
    # Only existing accepted connections can see each other's presence.
    from routes.message_push import access_token, base
    from urllib.parse import quote
    import httpx
    pair = '~'.join(sorted((own, peer)))
    async with httpx.AsyncClient(timeout=8) as client:
        result = await client.get(base() + '/communityConnections/' + quote(pair, safe=''),
                                  headers={'Authorization': 'Bearer ' + access_token()})
        blocked = await asyncio.gather(*(client.get(
            base() + '/communityBlocks/' + quote(uid, safe='') + '/targets/' + quote(target, safe=''),
            headers={'Authorization': 'Bearer ' + access_token()})
            for uid, target in ((own, peer), (peer, own))))
    if result.status_code == 404:
        raise HTTPException(404, 'Not found')
    if not result.is_success:
        raise HTTPException(503, 'Presence unavailable')
    fields = result.json().get('fields', {})
    if fields.get('status', {}).get('stringValue') != 'accepted':
        raise HTTPException(404, 'Not found')
    if any(r.status_code == 200 for r in blocked):
        raise HTTPException(404, 'Not found')
    if any(r.status_code not in (200, 404) for r in blocked):
        raise HTTPException(503, 'Presence unavailable')
    return {'online': _presence.get(peer, 0) > time.monotonic()}


# app.py mounts the static PWA at "/". Keep beta-only API routes ahead of that
# catch-all mount so authenticated requests reach these handlers.
from routes.message_actions import router as message_actions_router
app.include_router(message_actions_router)
_presence_routes = app.router.routes[-3:]
del app.router.routes[-3:]
_static_mount = next(i for i, route in enumerate(app.router.routes) if type(route).__name__ == 'Mount' and getattr(route, 'path', None) == '')
app.router.routes[_static_mount:_static_mount] = _presence_routes


def verify_token(token):
    claims = id_token.verify_firebase_token(token, CERT_REQUEST, audience=PROJECT)
    now = time.time()
    if (claims.get("iss") != f"https://securetoken.google.com/{PROJECT}"
            or not isinstance(claims.get("sub"), str)
            or not 1 <= len(claims["sub"]) <= 128
            or not isinstance(claims.get("auth_time"), (int, float))
            or claims["auth_time"] > now):
        raise ValueError("Invalid Firebase claims")
    return claims


def consume_quota(uid):
    """Single-instance burst guard, resets on restart; not a billing cap."""
    now = time.monotonic()
    for key, limit in (("global", GLOBAL_RPM), ("user:" + uid, USER_RPM)):
        bucket = _buckets.setdefault(key, deque())
        while bucket and bucket[0] <= now - 60:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
    _buckets["global"].append(now)
    _buckets["user:" + uid].append(now)
    _buckets.move_to_end("user:" + uid)
    while len(_buckets) > 10001:
        key = next(k for k in _buckets if k != "global")
        del _buckets[key]
    return True


@app.middleware("http")
async def beta_auth(request: Request, call_next):
    path = request.url.path
    if (request.method == "POST" and path == "/api/capsules/dispatch"):
        # This route authenticates the trusted scheduler with its own secret.
        return await call_next(request)
    if (request.method == "GET" and path == "/api/google-calendar/callback") or request.method == "OPTIONS" or not (path.startswith("/api/") or path == "/transcribe"):
        return await call_next(request)
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        return JSONResponse({"detail": "Please sign in to use KimKim AI."}, status_code=401)
    try:
        claims = await run_in_threadpool(verify_token, header[7:])
    except ValueError:
        return JSONResponse({"detail": "Invalid or expired sign-in token."}, status_code=401)
    except Exception:
        return JSONResponse({"detail": "Sign-in verification is temporarily unavailable."}, status_code=503)
    request.state.uid = claims["sub"]
    if path.startswith("/api/meet-bot/") and os.getenv("MEET_WORKER_URL"):
        from routes.meet_dispatch import dispatch
        return await dispatch(request)
    if path.startswith("/api/meet-bot/"):
        return JSONResponse({"detail": "KimKim Meeting needs a separate meeting worker; it is not deployed on this free beta server."}, status_code=503)
    if request.method != "GET" and path != '/api/community/presence' and not consume_quota(claims["sub"]):
        return JSONResponse({"detail": "Beta request limit reached. Please try again in one minute."}, status_code=429, headers={"Retry-After": "60"})
    response = await call_next(request)
    if path.rstrip("/") in ("/api/transcribe", "/transcribe") and response.status_code in (502, 503, 504):
        # Presentation only: preserve the AI engineer's route and request/output contract.
        message = ("The speech-to-text request timed out. Please try again later."
                   if response.status_code == 504 else
                   "The speech-to-text service is temporarily unavailable. Please try again when the AI service is back online.")
        headers = {key: value for key, value in response.headers.items()
                   if key.lower().startswith("access-control-") or key.lower() == "vary"}
        return JSONResponse({"detail": message}, status_code=response.status_code, headers=headers)
    return response

