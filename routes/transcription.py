"""Transcription route — proxies file upload / recording transcription to Gipformer STT."""

import logging
import os
import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from routes.speech_errors import speech_error_message

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
                logger.warning('Speech upstream returned HTTP %s', resp.status_code)
                raise HTTPException(status_code=resp.status_code, detail=speech_error_message(resp.status_code))
            try:
                result = resp.json()
            except ValueError:
                raise HTTPException(502, speech_error_message(502))
            if not isinstance(result, dict):
                raise HTTPException(502, speech_error_message(502))
            if result.get('status') == 'error':
                raise HTTPException(502, speech_error_message(502))
            return result
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(504, speech_error_message(504))
    except httpx.ConnectError:
        logger.error('Speech upstream connection failed')
        raise HTTPException(
            status_code=503,
            detail=speech_error_message(503)
        )
    except Exception as e:
        logger.error("Transcription proxy failed (%s)", type(e).__name__)
        raise HTTPException(status_code=500, detail=speech_error_message(500))
