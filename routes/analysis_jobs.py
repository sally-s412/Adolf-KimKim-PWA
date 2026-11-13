"""Authenticated background analysis for long transcripts. Existing synchronous APIs remain compatible."""
import asyncio
import hashlib
import json
import time
import uuid
from collections import OrderedDict
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from routes.profile_media import authenticate
from routes.summary_service import summarize_meeting, answer_meeting_question
from routes.long_context import AIServiceError, progress

router = APIRouter(prefix="/api/analysis-jobs", tags=["analysis-jobs"])
JOBS = OrderedDict()

async def run_job(job, payload):
    token = progress.set(lambda value: job.update(progress=value))
    try:
        if payload["kind"] == "summary":
            result = await summarize_meeting(payload["transcript"])
            job["result"] = {"status": "ok", **result}
        else:
            reply = await answer_meeting_question(payload["message"], payload["transcript"])
            job["result"] = {"status": "ok", "reply": reply}
        job["status"] = "done"
    except AIServiceError as exc:
        job.update(status="error", message=str(exc), error_code=exc.status)
    except Exception:
        job.update(status="error", message="Chưa xử lý được nội dung. Vui lòng thử lại.", error_code=500)
    finally:
        progress.reset(token)
        job["updated"] = time.monotonic()

@router.post("")
async def start(request: Request):
    uid = await authenticate(request)
    payload = await request.json()
    if not isinstance(payload, dict) or payload.get("kind") not in ("summary", "chat"):
        raise HTTPException(400, "Invalid analysis request.")
    rows = payload.get("transcript")
    if not isinstance(rows, list) or not rows or len(rows) > 30000 or any(
            not isinstance(s, dict) or not isinstance(s.get("text", ""), str) for s in rows):
        raise HTTPException(422, "A valid transcript is required.")
    if sum(len(s.get("text", "")) for s in rows) > 500000:
        raise HTTPException(413, "Nội dung vượt giới hạn 500.000 ký tự của một lần phân tích.")
    if payload["kind"] == "chat" and (not isinstance(payload.get("message"), str) or
            not 1 <= len(payload["message"].strip()) <= 2000):
        raise HTTPException(422, "Question must contain 1–2,000 characters.")
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    now = time.monotonic()
    for key, job in list(JOBS.items()):
        if job["status"] != "processing" and now - job["updated"] > 3600:
            JOBS.pop(key)
    for key, job in JOBS.items():
        if job["uid"] == uid and job["fingerprint"] == fingerprint and job["status"] != "error":
            return JSONResponse({"job_id": key, "status": job["status"]}, status_code=202)
    if sum(j["uid"] == uid and j["status"] == "processing" for j in JOBS.values()) >= 2:
        raise HTTPException(429, "Bạn đang có hai yêu cầu AI đang xử lý. Vui lòng chờ hoàn tất.")
    if sum(j["status"] == "processing" for j in JOBS.values()) >= 20:
        raise HTTPException(429, "AI đang có nhiều yêu cầu. Vui lòng thử lại sau.")
    while len(JOBS) >= 100:
        completed = next((k for k, j in JOBS.items() if j["status"] != "processing"), None)
        if completed is None:
            raise HTTPException(429, "AI queue is full.")
        JOBS.pop(completed)
    key = uuid.uuid4().hex
    job = {"uid": uid, "fingerprint": fingerprint, "status": "processing",
           "progress": {"phase": "queued", "done": 0, "total": 0}, "updated": now}
    JOBS[key] = job
    job["task"] = asyncio.create_task(run_job(job, payload))
    return JSONResponse({"job_id": key, "status": "processing"}, status_code=202,
                        headers={"Cache-Control": "no-store"})

@router.get("/{job_id}")
async def get_job(job_id: str, request: Request):
    uid = await authenticate(request)
    job = JOBS.get(job_id)
    if not job or job["uid"] != uid:
        raise HTTPException(404, "Phiên xử lý không còn tồn tại. Hãy gửi lại yêu cầu; transcript của bạn vẫn được lưu.")
    result = {k: job[k] for k in ("status", "progress", "result", "message", "error_code") if k in job}
    return JSONResponse(result, headers={"Cache-Control": "no-store"})
