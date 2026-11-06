"""Meeting Summarization Service — Groq API with Qwen model."""

import os
import re
import logging
import asyncio
import hashlib
from collections import OrderedDict
from routes.long_context import (AIServiceError, estimate_tokens, split_text, relevant_context, overview_question, window, report)
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("summary")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "qwen/qwen3.8-27b"

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



_summary_cache = OrderedDict()

async def _model_call(prompt, temperature, max_tokens):
    reservation = estimate_tokens(prompt) + max_tokens
    if reservation > 6000:
        raise AIServiceError(413)
    async with window.lock:
        for attempt in range(3):
            entry = await window.reserve(reservation)
            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    response = await client.post(GROQ_URL,
                        json={"model": MODEL, "messages": [{"role": "user", "content": prompt}],
                              "temperature": temperature, "max_tokens": max_tokens},
                        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"})
            except httpx.TimeoutException:
                raise AIServiceError(504)
            except httpx.HTTPError:
                raise AIServiceError(503)
            if response.status_code == 429 and attempt < 2:
                try:
                    delay = min(65, max(1, float(response.headers.get("retry-after", "61"))))
                except ValueError:
                    delay = 61
                report("rate_wait", int(delay), 0)
                await asyncio.sleep(delay)
                continue
            if response.status_code != 200:
                logger.warning("AI upstream returned HTTP %s", response.status_code)
                raise AIServiceError(response.status_code)
            try:
                data = response.json()
                entry[1] = max(1, int(data.get("usage", {}).get("total_tokens", reservation)))
                content = data["choices"][0]["message"]["content"].strip()
            except (ValueError, KeyError, TypeError, IndexError):
                raise AIServiceError(502)
            if "</think>" in content:
                content = content.split("</think>")[-1].strip()
            if not content:
                raise AIServiceError(502)
            return content

async def _summarize_text(text, depth=0, limit=5000):
    if depth > 8:
        raise AIServiceError(413)
    chunks = split_text(text, limit)
    if len(chunks) == 1:
        try:
            return await _model_call(MEETING_SUMMARY_PROMPT.format(transcript=text), 0.3, 800)
        except AIServiceError as exc:
            if exc.status == 413 and limit > 640:
                return await _summarize_text(text, depth + 1, limit // 2)
            raise
    partials = []
    for index, chunk in enumerate(chunks, 1):
        report("summarizing", index - 1, len(chunks))
        partials.append(await _summarize_text(chunk, depth + 1, limit))
        report("summarizing", index, len(chunks))
    combined = "\n\n".join(partials)
    if len(combined.encode("utf-8")) >= len(text.encode("utf-8")):
        # Return every generated section instead of truncating or looping indefinitely.
        return "\n\n---\n\n".join(partials)
    report("merging", 0, 0)
    return await _summarize_text(combined, depth + 1, 5000)

async def summarize_meeting(transcript_segments: list[dict]) -> dict:
    transcript_text = format_transcript(transcript_segments)
    if not transcript_text.strip():
        return {"title": "No Content", "key_points": [],
                "summary": "The transcript was empty or contained no meaningful content."}
    key = hashlib.sha256(transcript_text.encode()).hexdigest()
    if key in _summary_cache:
        _summary_cache.move_to_end(key)
        return dict(_summary_cache[key])
    report("preparing", 0, 0)
    result = parse_response(await _summarize_text(transcript_text))
    _summary_cache[key] = result
    while len(_summary_cache) > 20:
        _summary_cache.popitem(last=False)
    return dict(result)

async def answer_meeting_question(question: str, transcript_segments: list[dict]) -> str:
    transcript_text = format_transcript(transcript_segments)
    if len(question.encode("utf-8")) > 4000:
        raise AIServiceError(413)
    if len(transcript_text.encode("utf-8")) > 5000:
        report("selecting_context", 0, 0)
        context = "" if overview_question(question) else relevant_context(transcript_text, question)
        if not context:
            summary = await summarize_meeting(transcript_segments)
            context = summary["summary"]
            # A rare non-compressible summary remains bounded via selection of its sections.
            if len(context.encode("utf-8")) > 5000:
                context = await _summarize_text(context, limit=2500)
                if len(context.encode("utf-8")) > 5000:
                    raise AIServiceError(413)
        transcript_text = context
    prompt = f"""You are Adolf KimKim, an intelligent meeting assistant.
Based on the following meeting transcript, answer the user's question accurately and concisely.
If the information is not present in the transcript, state that clearly.
Always answer in the language of the user's question.

Transcript:
{transcript_text}

User Question: {question}
Answer:"""
    report("answering", 0, 0)
    return await _model_call(prompt, 0.5, 600)
