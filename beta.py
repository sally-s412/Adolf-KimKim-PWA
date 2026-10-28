"""Small, authenticated API + PWA for the free beta deployment.

No local ONNX/Chromium runtime is loaded by this entrypoint. Token verification
uses Google's public certificates; no Firebase service-account secret is needed.
"""
import os
import time
from collections import OrderedDict, deque

import cachecontrol
import requests
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app import app

PROJECT = os.getenv("FIREBASE_PROJECT_ID", "adolfkimkim")
CERT_REQUEST = GoogleRequest(session=cachecontrol.CacheControl(requests.Session()))
USER_RPM = int(os.getenv("BETA_USER_RPM", "10"))
GLOBAL_RPM = int(os.getenv("BETA_GLOBAL_RPM", "25"))
_buckets = OrderedDict()


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
    if request.method == "OPTIONS" or not (path.startswith("/api/") or path == "/transcribe"):
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
    if path.startswith("/api/meet-bot/"):
        return JSONResponse({"detail": "KimKim Meeting needs a separate meeting worker; it is not deployed on this free beta server."}, status_code=503)
    if request.method != "GET" and not consume_quota(claims["sub"]):
        return JSONResponse({"detail": "Beta request limit reached. Please try again in one minute."}, status_code=429, headers={"Retry-After": "60"})
    # Bound JSON payloads as well as multipart audio, including chunked requests.
    max_bytes = 21 * 1024 * 1024 if path in ("/api/transcribe", "/transcribe") else 2 * 1024 * 1024
    size = 0
    body = bytearray()
    async for chunk in request.stream():
        size += len(chunk)
        if size > max_bytes:
            return JSONResponse({"detail": "Request is too large for the beta."}, status_code=413)
        body.extend(chunk)
    request._body = bytes(body)
    if path not in ("/api/powerpoint", "/api/visualization") and not os.getenv("GROQ_API_KEY"):
        return JSONResponse({"detail": "AI is not enabled yet. Configure GROQ_API_KEY in the server environment."}, status_code=503)
    return await call_next(request)
