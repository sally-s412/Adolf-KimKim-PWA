"""Adolf KimKim Backend — Meeting Intelligence & Summarization API."""

import json
import logging
import os
from urllib.parse import quote
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

from routes.summary_service import summarize_meeting, answer_meeting_question
from routes.mindmap import generate_mindmap, render_preview_html
from routes.powerpoint import generate_pptx
from routes.visualization import generate_image
from routes.transcription import router as transcription_router
from routes.chatbot import router as chatbot_router
from routes.meet_bot import router as meet_bot_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("server")

app = FastAPI(title="Adolf KimKim Backend")


@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    if any(request.url.path.endswith(ext) for ext in [".js", ".css", ".html", ".ico"]) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(transcription_router)
app.include_router(chatbot_router)
app.include_router(meet_bot_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "Adolf KimKim Backend"}


# ── Summarization ────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    transcript: list[dict]


@app.post("/api/summarize")
async def summarize_endpoint(req: SummarizeRequest):
    try:
        result = await summarize_meeting(req.transcript)
        return {"status": "ok", **result}
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        return {"status": "error", "message": str(e)}


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    transcript: list[dict] = []


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        reply = await answer_meeting_question(req.message, req.transcript)
        return {"status": "ok", "reply": reply}
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        return {"status": "error", "message": str(e)}


# ── Mindmap ──────────────────────────────────────────────────────────────────

class MindmapRequest(BaseModel):
    transcript: list[dict]


@app.post("/api/mindmap")
async def mindmap_endpoint(req: MindmapRequest):
    try:
        md = await generate_mindmap(req.transcript)
        return {"status": "ok", "mindmap_md": md}
    except Exception as e:
        logger.error(f"Mindmap failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/mindmap/preview", response_class=HTMLResponse)
async def mindmap_preview_endpoint(req: MindmapRequest):
    """Returns a self-contained HTML page rendering the mindmap with markmap."""
    md = await generate_mindmap(req.transcript)
    return HTMLResponse(content=render_preview_html(md))


# ── PowerPoint ───────────────────────────────────────────────────────────────

class PowerPointRequest(BaseModel):
    title: str
    key_points: list[str] = []
    summary: str


def download_disposition(title: str, extension: str) -> str:
    """Keep Unicode filenames in RFC 5987 form, with an ASCII fallback."""
    stem = "".join(
        char for char in title[:40].replace(" ", "_")
        if ord(char) >= 32 and ord(char) != 127 and char not in "/\\"
    ).strip(" .") or "meeting-summary"
    encoded = quote(stem + extension, safe="")
    return f"attachment; filename=\"meeting-summary{extension}\"; filename*=UTF-8''{encoded}"


@app.post("/api/powerpoint")
async def powerpoint_endpoint(req: PowerPointRequest):
    try:
        pptx_bytes = generate_pptx(req.title, req.key_points, req.summary)
        return Response(
            content=pptx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": download_disposition(req.title, ".pptx")},
        )
    except Exception as e:
        logger.error(f"PowerPoint failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


# ── Visualization ─────────────────────────────────────────────────────────────

class VisualizationRequest(BaseModel):
    title: str
    key_points: list[str] = []
    summary: str


@app.post("/api/visualization")
async def visualization_endpoint(req: VisualizationRequest):
    try:
        png_bytes = generate_image(req.title, req.key_points, req.summary)
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Content-Disposition": download_disposition(req.title, ".png")},
        )
    except Exception as e:
        logger.error(f"Visualization failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8899))
    uvicorn.run(app, host="0.0.0.0", port=port)
