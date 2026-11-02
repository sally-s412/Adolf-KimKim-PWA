"""Bounded context utilities. No provider/model credentials or prompts live here."""
import asyncio
import math
import re
import time
import unicodedata
from collections import deque, Counter
from contextvars import ContextVar

progress = ContextVar("analysis_progress", default=None)

def report(phase, done=0, total=0):
    callback = progress.get()
    if callback:
        callback({"phase": phase, "done": done, "total": total})

class AIServiceError(RuntimeError):
    def __init__(self, status):
        self.status = status
        messages = {
            413: "Nội dung vẫn vượt giới hạn xử lý AI. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
            429: "AI đang đạt giới hạn sử dụng. Vui lòng thử lại sau.",
            401: "Dịch vụ AI chưa xác thực được cấu hình truy cập.",
            404: "Dịch vụ AI chưa tìm thấy mô hình được cấu hình.",
            504: "Dịch vụ AI xử lý quá thời gian chờ. Vui lòng thử lại.",
        }
        super().__init__(messages.get(status, "Dịch vụ AI tạm thời chưa xử lý được yêu cầu. Vui lòng thử lại."))

def estimate_tokens(text):
    # Conservative heuristic, not an exact tokenizer. Provider usage is authoritative.
    return max(1, math.ceil(len(text.encode("utf-8")) / 2))

def split_text(text, limit=5000):
    if limit < 128:
        raise ValueError("Context limit too small")
    chunks, part, size = [], [], 0
    for char in text:
        n = len(char.encode("utf-8"))
        if size + n > limit:
            chunks.append("".join(part))
            part, size = [], 0
        part.append(char)
        size += n
    if part:
        chunks.append("".join(part))
    return chunks

def words(value):
    value = unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
    return re.findall(r"[a-z0-9]+", "".join(c for c in value if unicodedata.category(c) != "Mn"))

def overview_question(question):
    normalized = " ".join(words(question))
    return any(p in normalized for p in (
        "noi dung chinh", "y chinh", "diem chinh", "quyet dinh", "viec can lam", "action items", "decisions", "tom tat", "tong quan", "cot loi",
        "cuoc hop noi ve", "summary", "summarize", "overview", "main content",
        "main points", "key points", "main topics", "what was discussed"))

def relevant_context(text, question, limit=5000):
    chunks = split_text(text, 1200)
    query = set(words(question)) - set("la gi cua va nhung toi cho hay ve trong cuoc hop the a an of and is are what this meeting please".split())
    doc_words = [Counter(words(c)) for c in chunks]
    scores = []
    for index, counts in enumerate(doc_words):
        score = sum((1 + math.log(counts[w])) * math.log(1 + len(chunks) /
                    (1 + sum(w in other for other in doc_words))) for w in query if counts[w])
        scores.append((score, index))
    ranked = [i for score, i in sorted(scores, reverse=True) if score > 0]
    if not ranked:
        return ""  # Caller uses an overview rather than pretending the head is the whole meeting.
    chosen, size = [], 0
    for index in ranked:
        n = len(chunks[index].encode("utf-8"))
        if size + n <= limit:
            chosen.append(index)
            size += n
    return "\n\n".join(chunks[i] for i in sorted(chosen))

class TokenWindow:
    def __init__(self, budget=6000):
        self.budget = budget
        self.entries = deque()
        self.lock = asyncio.Lock()

    async def reserve(self, tokens):
        now = time.monotonic()
        while self.entries and self.entries[0][0] <= now - 61:
            self.entries.popleft()
        while self.entries and sum(v for _, v in self.entries) + tokens > self.budget:
            wait = max(0.01, self.entries[0][0] + 61 - time.monotonic())
            report("rate_wait", int(wait), 0)
            await asyncio.sleep(wait)
            now = time.monotonic()
            while self.entries and self.entries[0][0] <= now - 61:
                self.entries.popleft()
        entry = [time.monotonic(), tokens]
        self.entries.append(entry)
        return entry

window = TokenWindow()
