"""Meeting Summarization Service — Groq API with Qwen model."""

import os
import re
import logging
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("summary")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

MEETING_SUMMARY_PROMPT = """\
You are a professional meeting analyst. Analyze the following meeting transcript and produce a structured summary.

CRITICAL RULES:
- Detect the transcript language and write the ENTIRE summary in that same language.
- Be factual — only include what was actually said. Do not invent information.
- Be concise and actionable.

Output format (use these exact headers on their own line):
Title: [A clear, informative meeting title in the transcript's language]
Key_Points: [Comma-separated list of 4-6 main topics/themes discussed]

Main Summary:
## Overview
[2-3 sentence executive summary of what the meeting was about]

## Key Discussions
[Bullet points of the main topics discussed, attributed to speakers where relevant]

## Decisions Made
[Bullet points of any decisions or agreements reached — write "None explicitly stated" if none]

## Action Items
[Numbered list of follow-up tasks with owners if mentioned — write "None explicitly stated" if none]

---
Transcript:
{transcript}
"""


def format_transcript(segments: list[dict]) -> str:
    """Convert transcript segments into speaker-attributed timestamped text."""
    lines = []
    for seg in segments:
        speaker = seg.get("speaker", "Unknown")
        text = seg.get("text", "").strip()
        time_s = seg.get("start", seg.get("t", 0))
        if not text:
            continue
        mins, secs = divmod(int(time_s), 60)
        lines.append(f"[{mins:02d}:{secs:02d}] {speaker}: {text}")
    return "\n".join(lines)


def parse_response(content: str) -> dict:
    """Extract title, key_points, and summary from LLM response."""
    title = ""
    key_points = []
    summary_lines = []

    for line in content.split("\n"):
        stripped = line.strip()
        if re.match(r"^Title:\s*", stripped, re.IGNORECASE):
            title = re.sub(r"^Title:\s*", "", stripped).strip().strip('"')
        elif re.match(r"^Key_Points:\s*", stripped, re.IGNORECASE):
            raw = re.sub(r"^Key_Points:\s*", "", stripped)
            key_points = [kp.strip() for kp in raw.split(",") if kp.strip()]
        else:
            summary_lines.append(line)

    summary = "\n".join(summary_lines).strip()
    summary = re.sub(
        r"^(?:Main\s+)?Summary:\s*\n?", "", summary, flags=re.IGNORECASE
    ).strip()

    return {
        "title": title or "Meeting Summary",
        "key_points": key_points or ["Meeting"],
        "summary": summary or content,
    }


async def summarize_meeting(transcript_segments: list[dict]) -> dict:
    """
    Summarize a meeting from its transcript segments.

    Args:
        transcript_segments: List of dicts with keys: speaker, text, start/t

    Returns:
        dict with keys: title, key_points, summary
    """
    transcript_text = format_transcript(transcript_segments)

    if not transcript_text.strip():
        return {
            "title": "No Content",
            "key_points": [],
            "summary": "The transcript was empty or contained no meaningful content.",
        }

    prompt = MEETING_SUMMARY_PROMPT.format(transcript=transcript_text)
    logger.info(
        f"Summarizing: {len(transcript_segments)} segments, {len(transcript_text)} chars"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GROQ_URL,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 800,
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        logger.error(f"Groq API error {resp.status_code}: {resp.text[:200]}")
        raise RuntimeError(f"Groq API returned {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip <think>...</think> tags if Qwen includes them
    if "</think>" in content:
        content = content.split("</think>")[-1].strip()

    result = parse_response(content)
    logger.info(f"Done: '{result['title']}' — {len(result['key_points'])} key points")
    return result


async def answer_meeting_question(question: str, transcript_segments: list[dict]) -> str:
    """Answer questions about the meeting based on transcript context."""
    transcript_text = format_transcript(transcript_segments)
    prompt = f"""You are Adolf KimKim, an intelligent meeting assistant.
Based on the following meeting transcript, answer the user's question accurately and concisely.
If the information is not present in the transcript, state that clearly.
Always answer in the language of the user's question.

Transcript:
{transcript_text}

User Question: {question}
Answer:"""

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GROQ_URL,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
                "max_tokens": 600,
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        logger.error(f"Groq chat error {resp.status_code}: {resp.text[:200]}")
        return "Xin lỗi, không thể kết nối tới mô hình AI lúc này."

    content = resp.json()["choices"][0]["message"]["content"].strip()
    if "</think>" in content:
        content = content.split("</think>")[-1].strip()
    return content
