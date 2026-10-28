"""FastAPI Server for Gipformer STT (WebSocket Streaming + HTTP Offline Transcription)."""

import json
import logging
import os
import sys
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure speech module is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core.model_manager import GipformerModelManager
from core.gipformer_transcriber import GipformerSonioxAdapter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("speech_app")

app = FastAPI(title="Gipformer Speech Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = GipformerModelManager()


@app.get("/health")
def health():
    return {"status": "ok", "service": "gipformer-speech"}


@app.post("/v1/audio/transcriptions")
@app.post("/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    """Offline transcription: upload audio file -> return segments with speakers + text."""
    try:
        content = await file.read()
        segments = manager.transcribe_file(content)
        full_text = " ".join(seg["text"] for seg in segments)
        return {"status": "ok", "text": full_text, "segments": segments}
    except Exception as e:
        logger.error(f"Offline transcription failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


@app.websocket("/v1/ws/realtime-speech")
@app.websocket("/ws/stt")
async def websocket_stt_endpoint(websocket: WebSocket):
    """Streaming WebSocket endpoint (Soniox protocol compatible)."""
    await websocket.accept()
    logger.info("Client connected to STT WebSocket")

    adapter = GipformerSonioxAdapter(client_ws=websocket, manager=manager)

    try:
        # First message is optional config
        first = await websocket.receive()
        config = {}
        if "text" in first:
            try:
                config = json.loads(first["text"])
            except Exception:
                pass
        elif "bytes" in first:
            # If client directly sent audio without config
            await adapter.connect({})
            await adapter.send_audio(first["bytes"])

        if not adapter.is_connected:
            if not await adapter.connect(config):
                await websocket.close()
                return

        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if "bytes" in msg:
                if len(msg["bytes"]) == 0:  # End of stream
                    await adapter.close()
                    break
                await adapter.send_audio(msg["bytes"])
            elif "text" in msg:
                await adapter.send_text(msg["text"])

    except WebSocketDisconnect:
        logger.info("STT client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await adapter.close()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 2609))
    uvicorn.run(app, host="0.0.0.0", port=port)
