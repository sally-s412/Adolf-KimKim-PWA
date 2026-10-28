"""Mindmap generation — Groq/Qwen → Markdown hierarchy + markmap HTML preview."""

import json
import logging
import os

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("mindmap")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

MINDMAP_PROMPT = """\
Analyze the meeting transcript and generate a structured mind map.

Output ONLY a Markdown hierarchy in the transcript's language — no commentary, no preamble, no code fences.

Format exactly like this:
# [Core Topic] 🧠
## [Key Theme 1] 📌
### [Sub-theme 1.1]
- [Main idea]
  * [Supporting detail]
## [Key Theme 2] 💡
- [Main idea]

Rules:
- Detect the transcript language and use it throughout
- **Bold** critical concepts, *italics* for terminology
- Emojis only on # and ## headings
- Only include information from the transcript

Transcript:
{transcript}
"""


def _format_transcript(segments: list[dict]) -> str:
    lines = []
    for seg in segments:
        speaker = seg.get("speaker", "Unknown")
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


async def generate_mindmap(transcript_segments: list[dict]) -> str:
    """Call Groq to produce mindmap Markdown from transcript segments."""
    transcript_text = _format_transcript(transcript_segments)
    if not transcript_text.strip():
        return "# Empty Meeting\n- No content provided."

    prompt = MINDMAP_PROMPT.format(transcript=transcript_text)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GROQ_URL,
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 800,
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        logger.error(f"Groq error {resp.status_code}: {resp.text[:200]}")
        raise RuntimeError(f"Groq API returned {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"].strip()
    if "</think>" in content:
        content = content.split("</think>")[-1].strip()

    logger.info(f"Mindmap generated: {len(content)} chars")
    return content


def render_preview_html(mindmap_md: str) -> str:
    """Wrap the mindmap Markdown in a markmap HTML page for browser preview."""
    md_json = json.dumps(mindmap_md)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Mindmap — Adolf KimKim</title>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#0f172a; }}
    svg.markmap {{ width:100vw; height:100vh; }}
    #toolbar {{
      position:fixed; top:12px; right:12px; z-index:99;
      display:flex; gap:8px;
    }}
    button {{
      background:#1e293b; color:#e2e8f0; border:1px solid #334155;
      padding:6px 14px; border-radius:6px; cursor:pointer; font-size:13px;
    }}
    button:hover {{ background:#334155; }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.16.0"></script>
  <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.16.0"></script>
</head>
<body>
  <div id="toolbar">
    <button onclick="window._mm && window._mm.fit()">Fit</button>
    <button onclick="window._mm && window._mm.rescale(1.25)">＋</button>
    <button onclick="window._mm && window._mm.rescale(0.8)">－</button>
  </div>
  <svg class="markmap"></svg>
  <script>
    window.addEventListener('load', () => {{
      const {{ Transformer }} = window.markmap;
      const transformer = new Transformer();
      const md = {md_json};
      const {{ root }} = transformer.transform(md);
      const {{ Markmap }} = window.markmap;
      window._mm = Markmap.create('svg.markmap', {{ colorFreezeLevel: 2, maxWidth: 280 }}, root);
    }});
  </script>
</body>
</html>"""
