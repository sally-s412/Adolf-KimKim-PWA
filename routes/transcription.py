"""Transcription route — proxies file upload / recording transcription to Gipformer STT."""

import logging
import os
import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

logger = logging.getLogger("routes.transcription")

router = APIRouter(tags=["transcription"])

SPEECH_SERVICE_URL = os.getenv("SPEECH_SERVICE_URL", "http://localhost:2609/v1/audio/transcriptions")


@router.post("/api/transcribe")
@router.post("/transcribe")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Upload audio file for offline transcription with speaker diarization."""
    try:
        content = await file.read()
        filename = file.filename or "audio.wav"
        content_type = file.content_type or "audio/wav"

        async with httpx.AsyncClient(timeout=180.0) as client:
            files = {"file": (filename, content, content_type)}
            resp = await client.post(SPEECH_SERVICE_URL, files=files)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except httpx.ConnectError:
        logger.error(f"Gipformer speech container unreachable at {SPEECH_SERVICE_URL}")
        raise HTTPException(
            status_code=503,
            detail="Speech service is unavailable. Please ensure the Gipformer container is running on port 2609."
        )
    except Exception as e:
        logger.error(f"Transcription proxy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
