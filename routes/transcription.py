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
        content = await file.read(20 * 1024 * 1024 + 1)
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Beta audio limit: 20 MB per file.")
        filename = file.filename or "audio.wav"
        content_type = file.content_type or "audio/wav"

        async with httpx.AsyncClient(timeout=180.0) as client:
            files = {"file": (filename, content, content_type)}
            if os.getenv("STT_PROVIDER", "gipformer") == "groq":
                key = os.getenv("GROQ_API_KEY")
                if not key:
                    raise HTTPException(status_code=503, detail="AI transcription is not configured.")
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions", files=files,
                    data={"model": os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"), "response_format": "verbose_json"},
                    headers={"Authorization": f"Bearer {key}"})
            else:
                resp = await client.post(SPEECH_SERVICE_URL, files=files)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            result = resp.json()
            if os.getenv("STT_PROVIDER", "gipformer") == "groq":
                # Whisper does not identify speakers. Never invent names.
                for segment in result.get("segments", []):
                    segment["speaker"] = "Unknown"
                result["diarization"] = False
            return result
    except HTTPException:
        raise
    except httpx.ConnectError:
        logger.error(f"Gipformer speech container unreachable at {SPEECH_SERVICE_URL}")
        raise HTTPException(
            status_code=503,
            detail="Speech service is unavailable. Please ensure the Gipformer container is running on port 2609."
        )
    except Exception as e:
        logger.error(f"Transcription proxy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
