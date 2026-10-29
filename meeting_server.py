"""Authenticated host for the original Meet capture/transcription/summary pipeline."""
import asyncio
import os
import re
import time
from urllib.parse import urlsplit
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from beta import verify_token
from routes import meet_bot

# Runtime-only adapter; keep the supplied worker and AI pipeline unchanged.
meet_bot.WORKER_SCRIPT = Path(__file__).with_name("meeting_capture_worker.py")

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
    return []  # This service captures audio; original AI runs on the existing API.


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
    job = meet_bot.JOBS[job_id]
    meta = meet_bot._read_worker_meta(job["job_dir"])
    if job["proc"].poll() is None:
        return {"status": meta.get("status", "joining"),
                "message": meta.get("message", job["message"]),
                "elapsed_sec": meta.get("elapsed_sec", 0),
                "participants": meta.get("participants", [])}
    audio = job["job_dir"] / "audio.wav"
    if not audio.exists() or audio.stat().st_size <= 44:
        job["status"] = "error"
        return {"status": "error", "message": meta.get("message") or "No audio recorded."}
    job["status"] = "done"
    return {"status": "recorded", "title": job["title"], "meta": meta}


@app.get("/api/meet-bot/audio/{job_id}")
async def audio(job_id: str, uid=Depends(identity)):
    own_job(job_id, uid)
    job = meet_bot.JOBS[job_id]
    if job["proc"].poll() is None:
        raise HTTPException(409, "Recording is still active.")
    path = job["job_dir"] / "audio.wav"
    if not path.exists():
        raise HTTPException(404, "Audio not available.")
    return FileResponse(path, media_type="audio/wav")
