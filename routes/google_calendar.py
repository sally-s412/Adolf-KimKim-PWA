"""Durable Calendar OAuth. Tokens are encrypted at rest and never sent to the browser."""
import base64
import hashlib
import html
import json
import logging
import os
import re
import secrets
import time
from urllib.parse import urlencode, quote, urlsplit

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from .profile_media import authenticate

router = APIRouter(prefix="/api/google-calendar", tags=["google-calendar"])
SCOPE = "https://www.googleapis.com/auth/calendar.events"
GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def config():
    names = ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET",
             "GOOGLE_CALENDAR_REDIRECT_URI", "GOOGLE_CALENDAR_FRONTEND_ORIGIN",
             "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"]
    values = [os.getenv(n, "").strip() for n in names]
    missing = [n for n, v in zip(names, values) if not v]
    if missing:
        raise HTTPException(503, {"code": "calendar/configuration", "fields": missing})
    cid, secret, redirect, origin, key = values
    parsed, front = urlsplit(redirect), urlsplit(origin)
    if (parsed.scheme != "https" or parsed.path != "/api/google-calendar/callback"
            or parsed.query or parsed.fragment or front.scheme != "https"
            or front.path not in ("", "/") or front.query or front.fragment or len(key) < 32):
        raise HTTPException(503, {"code": "calendar/configuration",
                                  "fields": ["redirect URI, frontend origin or encryption key (minimum 32 characters)"]})
    return cid, secret, redirect, origin.rstrip("/"), Fernet(
        base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))


def seal(value):
    return config()[4].encrypt(json.dumps(value).encode()).decode()


def unseal(value):
    try:
        return json.loads(config()[4].decrypt(value.encode()).decode())
    except (InvalidToken, ValueError, TypeError, AttributeError):
        raise HTTPException(400, "calendar/invalid-state-or-key")


def state_data(value):
    data = unseal(value)
    if data.get("kind") != "calendar-flow" or data.get("expires", 0) < time.time():
        raise HTTPException(400, "calendar/expired-state")
    return data


async def identity(request):
    uid = await authenticate(request)
    return uid, request.headers["authorization"]


def store_url(uid):
    project = os.getenv("FIREBASE_PROJECT_ID", "adolfkimkim")
    return ("https://firestore.googleapis.com/v1/projects/" + quote(project, safe="") +
            "/databases/(default)/documents/users/" + quote(uid, safe="") +
            "/integrations/googleCalendar")


async def document(uid, authorization, method="GET", record=None):
    kwargs = {"headers": {"Authorization": authorization}}
    if record is not None:
        # Only authenticated ciphertext is persisted; no plaintext OAuth credentials.
        kwargs["json"] = {"fields": {"encrypted": {"stringValue": seal(
            {"kind": "calendar-connection", "uid": uid, **record})}}}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.request(method, store_url(uid), **kwargs)
    if response.status_code == 404:
        return None
    if not response.is_success:
        raise HTTPException(503, "calendar/storage-unavailable")
    if method == "DELETE":
        return None
    data = response.json().get("fields", {}).get("encrypted", {}).get("stringValue")
    if not data:
        return None
    result = unseal(data)
    if result.get("kind") != "calendar-connection" or result.get("uid") != uid:
        raise HTTPException(409, "calendar/invalid-connection")
    return result


async def google_token(payload):
    cid, secret, *_ = config()
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(TOKEN_URL, data={
            "client_id": cid, "client_secret": secret, **payload})
    if not response.is_success:
        error = response.json().get("error", "")
        if error in ("invalid_grant", "access_denied"):
            raise HTTPException(409, "calendar/reconnect-required")
        raise HTTPException(502, "calendar/token-exchange-failed")
    return response.json()


async def connection_token(uid, authorization):
    record = await document(uid, authorization)
    if not record or not record.get("refresh_token"):
        raise HTTPException(409, "calendar/reconnect-required")
    if record.get("expires", 0) > time.time() + 90 and record.get("access_token"):
        return record["access_token"]
    fresh = await google_token({"grant_type": "refresh_token",
                                "refresh_token": record["refresh_token"]})
    record.update(access_token=fresh["access_token"],
                  expires=time.time() + int(fresh.get("expires_in", 3600)))
    if fresh.get("refresh_token"):
        record["refresh_token"] = fresh["refresh_token"]
    await document(uid, authorization, "PATCH", record)
    return record["access_token"]


@router.get("/status")
async def status(request: Request):
    uid, authorization = await identity(request)
    config()
    record = await document(uid, authorization)
    if not record:
        return JSONResponse({"connected": False}, headers={"Cache-Control": "no-store"})
    try:
        await connection_token(uid, authorization)
    except HTTPException as err:
        if err.status_code == 409:
            return JSONResponse({"connected": False, "reconnect": True},
                                headers={"Cache-Control": "no-store"})
        raise
    return JSONResponse({"connected": True, "email": record.get("email", "")},
                        headers={"Cache-Control": "no-store"})


@router.post("/start")
async def start(request: Request):
    uid, _ = await identity(request)
    cid, _, redirect, _, _ = config()
    verifier = secrets.token_urlsafe(48)
    state = seal({"kind": "calendar-flow", "uid": uid, "verifier": verifier,
                  "nonce": secrets.token_urlsafe(24), "expires": time.time() + 600})
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE + " openid email", "access_type": "offline", "prompt": "consent select_account",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
    return JSONResponse({"url": url, "state": state}, headers={"Cache-Control": "no-store"})


@router.get("/callback")
async def callback(request: Request):
    state = request.query_params.get("state", "")
    state_data(state)
    origin = config()[3]
    payload = {"type": "kimkim-calendar-oauth", "state": state,
               "code": request.query_params.get("code", ""),
               "error": request.query_params.get("error", "")}
    # JSON is escaped before embedding; no tokens travel through this public callback.
    message = json.dumps(payload).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    target = json.dumps(origin).replace("<", "\\u003c")
    nonce = secrets.token_urlsafe(20)
    markup = ('<!doctype html><html><meta charset="utf-8"><title>ADOLF KIMKIM Calendar</title>'
              '<p>Return to ADOLF KIMKIM to finish connecting Calendar.</p>'
              '<script nonce="' + nonce + '">if(window.opener){window.opener.postMessage(' +
              message + ',' + target + ');window.close();}</script></html>')
    return HTMLResponse(markup, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; script-src 'nonce-" + nonce + "'; frame-ancestors 'none'"})


@router.post("/exchange")
async def exchange(request: Request):
    uid, authorization = await identity(request)
    data = await request.json()
    state = state_data(data.get("state", ""))
    if state["uid"] != uid:
        raise HTTPException(403, "calendar/account-changed")
    code = data.get("code")
    if not isinstance(code, str) or not 1 <= len(code) <= 4096:
        raise HTTPException(400, "calendar/invalid-code")
    tokens = await google_token({"grant_type": "authorization_code", "code": code,
        "redirect_uri": config()[2], "code_verifier": state["verifier"]})
    if SCOPE not in tokens.get("scope", "").split():
        raise HTTPException(403, "calendar/permission-required")
    if not tokens.get("refresh_token"):
        raise HTTPException(409, "calendar/reconnect-required")
    async with httpx.AsyncClient(timeout=15) as client:
        info = await client.get("https://openidconnect.googleapis.com/v1/userinfo",
                               headers={"Authorization": "Bearer " + tokens["access_token"]})
    if not info.is_success or not info.json().get("email_verified"):
        raise HTTPException(502, "calendar/account-verification-failed")
    record = {"refresh_token": tokens["refresh_token"], "access_token": tokens["access_token"],
              "expires": time.time() + int(tokens.get("expires_in", 3600)),
              "email": info.json()["email"]}
    await document(uid, authorization, "PATCH", record)
    return JSONResponse({"connected": True, "email": record["email"]},
                        headers={"Cache-Control": "no-store"})


@router.delete("/connection")
async def disconnect(request: Request):
    uid, authorization = await identity(request)
    record = await document(uid, authorization)
    await document(uid, authorization, "DELETE")
    if record and record.get("refresh_token"):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post("https://oauth2.googleapis.com/revoke",
                                  data={"token": record["refresh_token"]})
        except httpx.HTTPError:
            pass  # Local connection is removed even if Google is temporarily offline.
    return {"connected": False}


@router.api_route("/events", methods=["GET", "POST"])
@router.api_route("/events/{event_id}", methods=["PATCH", "DELETE"])
async def events(request: Request, event_id: str = ""):
    uid, authorization = await identity(request)
    if event_id and not re.fullmatch(r"[a-zA-Z0-9_-]{1,1024}", event_id):
        raise HTTPException(400, "calendar/invalid-event")
    token = await connection_token(uid, authorization)
    allowed = {"timeMin", "timeMax", "singleEvents", "orderBy", "maxResults", "pageToken", "conferenceDataVersion"}
    query = {k: v for k, v in request.query_params.items() if k in allowed}
    kwargs = {"headers": {"Authorization": "Bearer " + token}, "params": query}
    if request.headers.get("if-match"):
        kwargs["headers"]["If-Match"] = request.headers["if-match"]
    if request.method in ("POST", "PATCH"):
        data = await request.json()
        if not isinstance(data, dict):
            raise HTTPException(400, "calendar/invalid-event")
        # Do not proxy attendees, arbitrary Google routes or email invitation settings.
        kwargs["json"] = {k: v for k, v in data.items()
                          if k in {"summary", "description", "location", "start", "end", "conferenceData"}}
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.request(request.method, GOOGLE_EVENTS +
            ("/" + quote(event_id, safe="") if event_id else ""), **kwargs)
    if not response.is_success:
        code = {401: "calendar/reconnect-required", 403: "calendar/google-permission-or-api",
                412: "calendar/event-changed", 429: "calendar/rate-limit"}.get(
                    response.status_code, "calendar/google-error")
        raise HTTPException(409 if response.status_code == 401 else response.status_code, code)
    if response.status_code == 204:
        return JSONResponse(None, status_code=200, headers={"Cache-Control": "no-store"})
    return JSONResponse(response.json(), headers={"Cache-Control": "no-store"})


class RedactCalendarCallback(logging.Filter):
    def filter(self, record):
        # Uvicorn access logs must not retain OAuth authorization codes or state.
        if isinstance(record.args, tuple) and len(record.args) == 5 and "/api/google-calendar/callback" in str(record.args[2]):
            args = list(record.args)
            args[2] = "/api/google-calendar/callback"
            record.args = tuple(args)
        return True


logging.getLogger("uvicorn.access").addFilter(RedactCalendarCallback())
