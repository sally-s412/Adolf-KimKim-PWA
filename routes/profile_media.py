"""Public profile images only. No chat attachments or AI configuration."""
import asyncio
import hashlib
import io
import os
import re
import time
import warnings
from collections import OrderedDict

import cachecontrol
import httpx
import requests
from fastapi import APIRouter, HTTPException, Request
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/profile-media", tags=["profile-media"])
CERT_REQUEST = GoogleRequest(session=cachecontrol.CacheControl(requests.Session()))
MAX_BYTES = 2 * 1024 * 1024
_recent = OrderedDict()


def settings():
    cloud = os.getenv("PROFILE_MEDIA_CLOUD_NAME", "")
    key = os.getenv("PROFILE_MEDIA_API_KEY", "")
    secret = os.getenv("PROFILE_MEDIA_API_SECRET", "")
    if not re.fullmatch(r"[a-z0-9-]{1,80}", cloud) or not key or not secret:
        raise HTTPException(503, "media/not-configured")
    return cloud, key, secret


def verify_user(token):
    project = os.getenv("FIREBASE_PROJECT_ID", "adolfkimkim")
    claims = id_token.verify_firebase_token(token, CERT_REQUEST, audience=project)
    uid = claims.get("sub", "")
    if (claims.get("iss") != f"https://securetoken.google.com/{project}"
            or not isinstance(uid, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", uid)
            or not isinstance(claims.get("auth_time"), (int, float))
            or claims["auth_time"] > time.time()):
        raise ValueError("Invalid claims")
    return uid


async def authenticate(request):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "media/sign-in")
    try:
        return await run_in_threadpool(verify_user, header[7:])
    except ValueError:
        raise HTTPException(401, "media/sign-in")
    except Exception:
        raise HTTPException(503, "media/auth-unavailable")


def normalize_image(raw, purpose):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as original:
                if original.format not in ("JPEG", "PNG", "WEBP"):
                    raise ValueError("format")
                if original.width * original.height > 16_000_000:
                    raise ValueError("pixels")
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((1600, 900) if purpose in ("cover", "chat") else (512, 512))
                out = io.BytesIO()
                image.save(out, "JPEG", quality=85)  # strips EXIF and other metadata
                return out.getvalue()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "media/invalid-image")


def reserve_upload(uid):
    # Single instance guard, not a durable billing cap. One upload per 10 seconds.
    now = time.monotonic()
    if uid in _recent and now - _recent[uid] < 10:
        raise HTTPException(429, "media/rate-limit", headers={"Retry-After": "10"})
    _recent[uid] = now
    _recent.move_to_end(uid)
    while len(_recent) > 10000:
        _recent.popitem(last=False)


async def send_image(cloud, key, secret, uid, purpose, raw):
    # Deterministic IDs keep one active avatar and one cover per user.
    public_id = f"kimkim/{purpose}s/{uid}/{purpose}"
    params = {"public_id": public_id, "timestamp": str(int(time.time())),
              "overwrite": "true", "invalidate": "true", "backup": "false"}
    canonical = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature = hashlib.sha1((canonical + secret).encode()).hexdigest()
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(f"https://api.cloudinary.com/v1_1/{cloud}/image/upload",
            data={**params, "api_key": key, "signature": signature},
            files={"file": (purpose + ".jpg", raw, "image/jpeg")})
    if response.status_code >= 400:
        raise HTTPException(502, "media/provider-unavailable")
    try:
        data = response.json()
        if data.get("public_id") != public_id or not isinstance(data.get("version"), int):
            raise ValueError("provider contract")
        # Construct URL from trusted configuration; ignore arbitrary returned URLs.
        return f"https://res.cloudinary.com/{cloud}/image/upload/v{data['version']}/{public_id}.jpg"
    except (ValueError, KeyError, TypeError):
        raise HTTPException(502, "media/provider-unavailable")


@router.post("/{purpose}")
async def upload_profile_image(purpose: str, request: Request):
    uid = await authenticate(request)
    if purpose not in ("avatar", "cover"):
        raise HTTPException(404, "media/unsupported-purpose")
    cloud, key, secret = settings()
    if request.headers.get("content-type", "").split(";")[0] != "image/jpeg":
        raise HTTPException(415, "media/invalid-image")
    reserve_upload(uid)
    raw = bytearray()
    try:
        async with asyncio.timeout(15):
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw) > MAX_BYTES:
                    raise HTTPException(413, "media/too-large")
    except TimeoutError:
        raise HTTPException(408, "media/upload-timeout")
    image = await run_in_threadpool(normalize_image, bytes(raw), purpose)
    try:
        async with asyncio.timeout(30):
            url = await send_image(cloud, key, secret, uid, purpose, image)
    except (TimeoutError, httpx.TimeoutException):
        raise HTTPException(504, "media/upload-timeout")
    except httpx.HTTPError:
        raise HTTPException(502, "media/provider-unavailable")
    return {"url": url}
