"""Global Chatbot Route — Adolf KimKim conversational assistant."""

import logging
import os
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("routes.chatbot")

router = APIRouter(tags=["chatbot"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

SYSTEM_PROMPT = """You are Adolf KimKim, an intelligent, charismatic, and highly capable AI assistant ("Thống trị thế giới cùng bạn").
You help users with productivity, meeting notes, brainstorming, answering questions, writing, and daily tasks.
Key Rules:
- Always reply in the same language as the user's message (primarily Vietnamese or English).
- Be clear, helpful, structured (use markdown headings, bolding, bullet points where appropriate).
- Maintain a confident, friendly, and supportive persona as Adolf KimKim.
- PAY ATTENTION to conversational memory: Remember and refer back to previous facts, names, questions, and context mentioned earlier in this conversation.
"""


class HistoryMessage(BaseModel):
    role: str
    content: str


class GlobalChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []


@router.post("/api/global-chat")
@router.post("/api/chatbot")
async def global_chat_endpoint(req: GlobalChatRequest):
    """Conversational endpoint for the global floating Adolf KimKim chatbot."""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Include recent conversation turns for context memory (up to last 25 messages)
    recent_history = req.history[-25:] if req.history else []
    logger.info("GlobalChat request: history_turns=%s", len(recent_history))
    for h in recent_history:
        role = "assistant" if h.role in ("agent", "assistant", "system") else "user"
        content = (h.content or "").strip()
        if content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": req.message.strip()})

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(
                GROQ_URL,
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1000,
                },
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code != 200:
            logger.error(f"Groq API error {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(status_code=resp.status_code, detail="Groq API error")

        data = resp.json()
        reply = data["choices"][0]["message"]["content"].strip()

        # Strip <think> tags if present in Qwen output
        if "</think>" in reply:
            reply = reply.split("</think>")[-1].strip()

        return {"status": "ok", "reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Global chatbot error: {e}")
        return {"status": "error", "message": str(e)}
