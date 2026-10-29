"""Authenticated host for the original Meet capture/transcription/summary pipeline."""
import asyncio
import os
import re
import time
from urllib.parse import urlsplit

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from beta import verify_token
from routes import meet_bot

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"])
owners = {}
admission_lock = asyncio.Lock()


async def identity(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in.")
    try:
        claims = await run_in_threadpool(verify_token, authorization[7:])
        return claims["sub"]
    except ValueError:
        raise HTTPException(401, "Invalid or expired sign-in token.")
    except Exception:
        raise HTTPException(503, "Sign-in verification temporarily unavailable.")


def prerequisites():
    return [key for key in ("SPEECH_SERVICE_URL", "GROQ_API_KEY") if not os.getenv(key)]


@app.get("/health")
def health():
    return {"status": "ok", "meeting_configured": not prerequisites(),
            "missing_configuration": prerequisites()}


def own_job(job_id, uid):
    if owners.get(job_id) != uid:
        raise HTTPException(404, "Meeting session not found.")


@app.post("/api/meet-bot/join")
async def join(req: meet_bot.JoinMeetRequest, uid=Depends(identity)):
    if prerequisites():
        raise HTTPException(503, "Original speech service and AI credentials must be configured.")
    url = req.meet_url.strip()
    if "://" not in url:
        url = "https://" + url
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.netloc != "meet.google.com"
            or not re.fullmatch(r"/[a-z]{3}-[a-z]{4}-[a-z]{3}/?", parsed.path)):
        raise HTTPException(400, "Invalid Google Meet URL.")
    async with admission_lock:
        if any(j["proc"].poll() is None or j["status"] not in ("done", "error")
               for j in meet_bot.JOBS.values()):
            raise HTTPException(409, "KimKim is already processing a meeting. Please wait.")
        req.meet_url = url
        result = await meet_bot.join_meet_endpoint(req)
        owners[result["job_id"]] = uid
        return result


@app.post("/api/meet-bot/stop/{job_id}")
async def stop(job_id: str, uid=Depends(identity)):
    own_job(job_id, uid)
    return await meet_bot.stop_meet_endpoint(job_id)


@app.get("/api/meet-bot/status/{job_id}")
async def status(job_id: str, uid=Depends(identity)):
    own_job(job_id, uid)
    return await meet_bot.status_meet_endpoint(job_id)
