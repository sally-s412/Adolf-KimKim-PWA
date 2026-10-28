"""FastAPI routes for dispatching and monitoring the Google Meet recording bot."""

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
import time
import uuid
from collections import Counter
from pathlib import Path
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routes.summary_service import summarize_meeting

logger = logging.getLogger("routes.meet_bot")
router = APIRouter(prefix="/api/meet-bot", tags=["meet-bot"])

BASE_DIR = Path(__file__).resolve().parent.parent
JOBS_DIR = BASE_DIR / "tmp" / "meet_jobs"
WORKER_SCRIPT = BASE_DIR / "routes" / "meet_bot_worker.py"
SPEECH_SERVICE_URL = os.getenv(
    "SPEECH_SERVICE_URL", "http://localhost:2609/v1/audio/transcriptions"
)

# In-memory registry of active/completed bot jobs
JOBS: dict[str, dict] = {}


class JoinMeetRequest(BaseModel):
    meet_url: str
    title: str = ""


def _read_worker_meta(job_dir: Path) -> dict:
    meta_file = job_dir / "meta.json"
    if not meta_file.exists():
        return {}
    try:
        return json.loads(meta_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def map_speakers_with_timeline(
    raw_segments: list[dict],
    speaker_timeline: list[dict],
    participants: list[str],
) -> list[dict]:
    """
    Map Gipformer diarized segments (SPEAKER_00, SPEAKER_01, ...) to real
    Google Meet participant names using the DOM active-speaker timeline.
    """
    if not raw_segments:
        return []

    # 1. For each segment, check if a single speaker in speaker_timeline overlaps [start, end]
    seg_direct_speaker: list[str | None] = []
    cluster_votes: dict[str, Counter] = {}

    for seg in raw_segments:
        s_start = float(seg.get("start", 0.0))
        s_end = float(seg.get("end", s_start + 1.0))
        cluster_id = seg.get("speaker", "SPEAKER_00")

        overlap_counts: Counter = Counter()
        for entry in speaker_timeline:
            t_start = float(entry.get("start", 0.0))
            t_end = float(entry.get("end", t_start + 0.5))
            # Check overlap with a +/- 0.8s tolerance for DOM/audio latency
            overlap = min(s_end + 0.8, t_end) - max(s_start - 0.8, t_start)
            if overlap > 0:
                overlap_counts[entry["speaker"]] += overlap

        if overlap_counts:
            best_name = overlap_counts.most_common(1)[0][0]
            seg_direct_speaker.append(best_name)
            cluster_votes.setdefault(cluster_id, Counter())[best_name] += overlap_counts[best_name]
        else:
            seg_direct_speaker.append(None)

    # 2. Build cluster -> real participant name map by majority vote
    cluster_to_name: dict[str, str] = {}
    for cluster_id, votes in cluster_votes.items():
        if votes:
            cluster_to_name[cluster_id] = votes.most_common(1)[0][0]

    # If only 1 human participant was in the Meet (besides the muted bot) and only 1 voice cluster exists,
    # attribute that voice cluster to that participant.
    unique_clusters = list(dict.fromkeys(seg.get("speaker", "SPEAKER_00") for seg in raw_segments))
    if len(participants) == 1 and len(unique_clusters) == 1 and unique_clusters[0] not in cluster_to_name:
        cluster_to_name[unique_clusters[0]] = participants[0]

    # 3. Assign final speaker labels
    mapped = []
    for idx, seg in enumerate(raw_segments):
        cluster_id = seg.get("speaker", "SPEAKER_00")
        speaker_name = (
            seg_direct_speaker[idx]
            or cluster_to_name.get(cluster_id)
            or cluster_id
        )
        mapped.append(
            {
                "start": round(float(seg.get("start", 0.0)), 2),
                "end": round(float(seg.get("end", 0.0)), 2),
                "t": int(float(seg.get("start", 0.0))),
                "speaker": speaker_name,
                "text": (seg.get("text") or "").strip(),
            }
        )
    return mapped


async def _post_process_job(job_id: str) -> None:
    """Once the worker finishes recording audio.wav, transcribe and summarize it."""
    job = JOBS.get(job_id)
    if not job or job.get("post_processing_started"):
        return
    job["post_processing_started"] = True

    job_dir: Path = job["job_dir"]
    wav_path = job_dir / "audio.wav"
    meta = _read_worker_meta(job_dir)
    participants = meta.get("participants", [])
    speaker_timeline = meta.get("speaker_timeline", [])
    elapsed_sec = int(meta.get("elapsed_sec", 0))

    if meta.get("status") == "error" and not wav_path.exists():
        job["status"] = "error"
        job["message"] = meta.get("message") or meta.get("error") or "Bot gặp lỗi."
        return

    if not wav_path.exists() or wav_path.stat().st_size <= 44:
        job["status"] = "error"
        job["message"] = meta.get("message") or "Không thu được dữ liệu âm thanh từ cuộc họp."
        return

    try:
        # 1. Transcribe via Gipformer Speech Service
        job["status"] = "transcribing"
        job["message"] = "Đang phiên âm giọng nói & nhận diện người nói (Gipformer)..."

        audio_bytes = wav_path.read_bytes()
        async with httpx.AsyncClient(timeout=300.0) as client:
            files = {"file": ("meeting_audio.wav", audio_bytes, "audio/wav")}
            resp = await client.post(SPEECH_SERVICE_URL, files=files)
            if resp.status_code != 200:
                raise RuntimeError(f"Gipformer STT error ({resp.status_code}): {resp.text[:200]}")
            stt_data = resp.json()

        raw_segments = stt_data.get("segments", [])
        transcript = map_speakers_with_timeline(raw_segments, speaker_timeline, participants)

        # Ensure any speaker identified in transcript is also listed in participants
        for seg in transcript:
            spk = seg["speaker"]
            if not spk.startswith("SPEAKER_") and spk not in participants:
                participants.append(spk)

        if not elapsed_sec and transcript:
            elapsed_sec = int(transcript[-1].get("end", 30)) + 2

        # 2. Auto-Summarize via Groq LLM
        job["status"] = "summarizing"
        job["message"] = "Đang tóm tắt cuộc họp với AI..."

        summary_data = {
            "title": job.get("title") or "Cuộc họp Google Meet",
            "key_points": [],
            "summary": "",
        }
        if transcript:
            try:
                summary_data = await summarize_meeting(transcript)
            except Exception as sum_err:
                logger.warning(f"Auto-summary warning for job {job_id}: {sum_err}")

        final_title = job.get("title") or summary_data.get("title") or "Cuộc họp Google Meet"

        job["result"] = {
            "title": final_title,
            "duration_sec": elapsed_sec or 30,
            "participants": participants,
            "transcript": transcript,
            "summary": summary_data.get("summary", ""),
            "key_points": summary_data.get("key_points", []),
        }
        job["status"] = "done"
        job["message"] = "Hoàn tất ghi âm, phiên âm và tóm tắt AI!"

    except Exception as e:
        logger.error(f"Post-processing failed for job {job_id}: {e}")
        job["status"] = "error"
        job["message"] = f"Lỗi xử lý âm thanh: {e}"


@router.post("/join")
async def join_meet_endpoint(req: JoinMeetRequest):
    meet_url = req.meet_url.strip()
    if "meet.google.com/" not in meet_url:
        raise HTTPException(status_code=400, detail="Link Google Meet không hợp lệ.")

    job_id = uuid.uuid4().hex[:10]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "xvfb-run",
        "-a",
        sys.executable,
        str(WORKER_SCRIPT),
        meet_url,
        str(job_dir),
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    JOBS[job_id] = {
        "job_id": job_id,
        "meet_url": meet_url,
        "title": req.title.strip(),
        "job_dir": job_dir,
        "proc": proc,
        "status": "joining",
        "message": "Đang khởi động Adolf KimKim Bot...",
        "created_at": time.time(),
        "post_processing_started": False,
        "result": None,
    }
    logger.info(f"Started Meet Bot job {job_id} for {meet_url} (pid={proc.pid})")
    return {"status": "ok", "job_id": job_id}


@router.post("/stop/{job_id}")
async def stop_meet_endpoint(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên ghi âm bot.")

    proc: subprocess.Popen = job["proc"]
    if proc.poll() is None:
        try:
            # Send SIGINT to the process group / worker so it stops FFmpeg cleanly
            os.killpg(os.getpgid(proc.pid), signal.SIGINT)
        except Exception:
            proc.send_signal(signal.SIGINT)
        job["message"] = "Đang rời cuộc họp và hoàn tất file ghi âm..."

    return {"status": "ok", "job_id": job_id}


@router.get("/status/{job_id}")
async def status_meet_endpoint(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên ghi âm bot.")

    proc: subprocess.Popen = job["proc"]
    meta = _read_worker_meta(job["job_dir"])

    # If worker is still running, report its live state from meta.json
    if proc.poll() is None:
        w_status = meta.get("status", job["status"])
        return {
            "status": w_status,
            "message": meta.get("message", job["message"]),
            "elapsed_sec": meta.get("elapsed_sec", 0),
            "participants": meta.get("participants", []),
        }

    # Worker has exited — kick off post-processing (transcription + summary) if not started
    if not job.get("post_processing_started"):
        asyncio.create_task(_post_process_job(job_id))
        return {
            "status": "transcribing",
            "message": "Cuộc họp kết thúc — đang bắt đầu phiên âm...",
            "elapsed_sec": meta.get("elapsed_sec", 0),
            "participants": meta.get("participants", []),
        }

    resp = {
        "status": job["status"],
        "message": job["message"],
        "elapsed_sec": meta.get("elapsed_sec", 0),
        "participants": meta.get("participants", []),
    }
    if job["status"] == "done" and job.get("result"):
        resp["result"] = job["result"]
    return resp
