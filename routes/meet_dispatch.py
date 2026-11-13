"""Move completed recordings to the existing API's unchanged AI pipeline."""
import asyncio
import json
import os
from pathlib import Path
import httpx
from fastapi.responses import JSONResponse
from routes import meet_bot

transfer_lock = asyncio.Lock()
cors = {"Access-Control-Allow-Origin": "https://adolf-kimkim-pwa.onrender.com"}

def reply(payload, status=200):
    return JSONResponse(payload, status_code=status, headers=cors)

async def dispatch(request):
    base = os.environ["MEET_WORKER_URL"].rstrip("/")
    if not base.startswith("https://"):
        return reply({"detail": "Meeting worker URL must use HTTPS."}, 503)
    path = request.url.path
    job_id = path.rsplit("/", 1)[-1]
    uid = request.state.uid
    is_status = path.startswith("/api/meet-bot/status/")
    local = meet_bot.JOBS.get(job_id) if is_status else None
    if local:
        if local.get("uid") != uid:
            return reply({"detail": "Meeting session not found."}, 404)
        data = {"status": local["status"], "message": local["message"],
                "elapsed_sec": local.get("elapsed_sec", 0),
                "participants": local.get("participants", [])}
        if local.get("result"):
            data["result"] = local["result"]
        return reply(data)
    headers = {"Authorization": request.headers.get("authorization", ""),
               "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.request(request.method, base + path,
                                           headers=headers, content=await request.body())
            try:
                data = response.json()
            except ValueError:
                return reply({"detail": "KimKim Meeting is starting. Please retry shortly."}, 503)
            if response.status_code != 200 or not is_status or data.get("status") != "recorded":
                return reply(data, response.status_code)
            async with transfer_lock:
                if job_id not in meet_bot.JOBS:
                    if not job_id.isalnum() or len(job_id) > 64:
                        return reply({"detail": "Invalid worker session."}, 502)
                    directory = meet_bot.JOBS_DIR / job_id
                    directory.mkdir(parents=True, exist_ok=True)
                    meta = data.get("meta", {})
                    async with client.stream("GET", base + "/api/meet-bot/audio/" + job_id,
                                             headers=headers) as stream:
                        if stream.status_code != 200:
                            return reply({"detail": "Recording transfer unavailable."}, 503)
                        with (directory / "audio.wav").open("wb") as output:
                            async for chunk in stream.aiter_bytes():
                                output.write(chunk)
                    (directory / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
                    meet_bot.JOBS[job_id] = {
                        "uid": uid, "job_dir": directory, "title": data.get("title", ""),
                        "status": "transcribing", "message": "Đang phiên âm và tóm tắt...",
                        "post_processing_started": False, "result": None,
                        "elapsed_sec": meta.get("elapsed_sec", 0),
                        "participants": meta.get("participants", [])}
                    # Original Gipformer, speaker mapping and summary code; no model/prompt changes.
                    asyncio.create_task(meet_bot._post_process_job(job_id))
            return reply({"status": "transcribing", "message": "Đang phiên âm và tóm tắt..."})
    except httpx.HTTPError:
        return reply({"detail": "KimKim Meeting is starting or temporarily unavailable. Please retry shortly."}, 503)
