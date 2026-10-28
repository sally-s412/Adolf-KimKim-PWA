"""Gipformer Transcriber — Offline audio transcription and real-time streaming adapter."""

import asyncio
import json
import logging
import subprocess
import threading
import time
from typing import List, Optional

import numpy as np
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from .model_manager import GipformerModelManager, SAMPLE_RATE
from .speaker_diarizer import SpeakerDiarizer

logger = logging.getLogger("gipformer.transcriber")


def transcribe_file(audio_bytes: bytes, manager: Optional[GipformerModelManager] = None) -> List[dict]:
    """Offline transcription of an audio file in one shot with diarization."""
    if manager is None:
        manager = GipformerModelManager()

    # Convert audio to 16kHz mono float32 array via ffmpeg
    cmd = [
        "ffmpeg", "-nostdin", "-threads", "0", "-i", "pipe:0",
        "-f", "s16le", "-acodec", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1"
    ]
    proc = subprocess.run(
        cmd, input=audio_bytes, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True
    )
    samples = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0

    vad = manager.create_vad()
    diarizer = SpeakerDiarizer(manager.speaker_extractor)
    window_size = 512
    segments = []
    current_time_sec = 0.0

    for i in range(0, len(samples), window_size):
        chunk = samples[i: i + window_size]
        if len(chunk) < window_size:
            chunk = np.pad(chunk, (0, window_size - len(chunk)))
        vad.accept_waveform(chunk)
        current_time_sec += len(chunk) / SAMPLE_RATE

        while not vad.empty():
            seg_samples = vad.front.samples
            vad.pop()
            seg_dur = len(seg_samples) / SAMPLE_RATE
            start_sec = max(0.0, current_time_sec - seg_dur)
            end_sec = current_time_sec

            text = manager.decode_samples(seg_samples)
            if text:
                speaker = diarizer.identify_speaker(seg_samples, SAMPLE_RATE)
                segments.append({
                    "speaker": speaker,
                    "start": round(start_sec, 2),
                    "end": round(end_sec, 2),
                    "text": text,
                })

    vad.flush()
    while not vad.empty():
        seg_samples = vad.front.samples
        vad.pop()
        seg_dur = len(seg_samples) / SAMPLE_RATE
        start_sec = max(0.0, current_time_sec - seg_dur)
        end_sec = current_time_sec
        text = manager.decode_samples(seg_samples)
        if text:
            speaker = diarizer.identify_speaker(seg_samples, SAMPLE_RATE)
            segments.append({
                "speaker": speaker,
                "start": round(start_sec, 2),
                "end": round(end_sec, 2),
                "text": text,
            })

    return segments


class GipformerSonioxAdapter:
    """Streaming WebSocket adapter speaking Soniox protocol, powered by Gipformer."""

    def __init__(self, client_ws: WebSocket, manager: GipformerModelManager):
        self.client_ws = client_ws
        self.manager = manager
        self.is_connected = False
        self._processing_task: Optional[asyncio.Task] = None
        self._audio_queue: asyncio.Queue = asyncio.Queue()
        self._vad = None
        self._diarizer: Optional[SpeakerDiarizer] = None
        self._cumulative_audio_ms: int = 0
        self._ffmpeg: Optional[subprocess.Popen] = None
        self._ffmpeg_reader_thread: Optional[threading.Thread] = None

        self._partial_last_emit_wall: float = 0.0
        self._partial_last_audio_sec: float = 0.0
        self._partial_count: int = 0

    async def connect(self, client_config: dict) -> bool:
        try:
            audio_format = client_config.get("audio_format", "pcm_s16le")
            enable_diarization = client_config.get("enable_speaker_diarization", True)

            loop = asyncio.get_running_loop()
            self._vad = await loop.run_in_executor(None, self.manager.create_vad)
            _ = await loop.run_in_executor(None, lambda: self.manager.recognizer)

            if enable_diarization:
                extractor = await loop.run_in_executor(None, lambda: self.manager.speaker_extractor)
                self._diarizer = SpeakerDiarizer(extractor)

            needs_decode = audio_format not in ("pcm_s16le", "pcm_s16", "s16le")
            if needs_decode:
                self._ffmpeg = subprocess.Popen(
                    ["ffmpeg", "-i", "pipe:0", "-f", "s16le", "-acodec", "pcm_s16le",
                     "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1"],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                )
                self._ffmpeg_reader_thread = threading.Thread(target=self._ffmpeg_stdout_reader, daemon=True)
                self._ffmpeg_reader_thread.start()

            self.is_connected = True
            self._processing_task = asyncio.create_task(self._process_audio_loop())
            return True
        except Exception as e:
            logger.error(f"Gipformer connect failed: {e}")
            return False

    def _ffmpeg_stdout_reader(self):
        try:
            while True:
                data = self._ffmpeg.stdout.read(3200)
                if not data:
                    break
                self._audio_queue.put_nowait(data)
        except Exception:
            pass
        finally:
            self._audio_queue.put_nowait(None)

    async def send_audio(self, data: bytes):
        if not self.is_connected:
            return
        if self._ffmpeg:
            try:
                self._ffmpeg.stdin.write(data)
                self._ffmpeg.stdin.flush()
            except Exception:
                pass
        else:
            await self._audio_queue.put(data)

    async def send_text(self, text: str):
        pass

    async def close(self):
        self.is_connected = False
        if self._ffmpeg:
            try:
                self._ffmpeg.stdin.close()
            except Exception:
                pass
            if self._ffmpeg_reader_thread:
                self._ffmpeg_reader_thread.join(timeout=2.0)
            try:
                self._ffmpeg.wait(timeout=2)
            except Exception:
                self._ffmpeg.kill()
            self._ffmpeg = None
        else:
            await self._audio_queue.put(None)

        if self._processing_task and not self._processing_task.done():
            try:
                await asyncio.wait_for(self._processing_task, timeout=5.0)
            except Exception:
                self._processing_task.cancel()

        if self.client_ws.client_state == WebSocketState.CONNECTED:
            await self.client_ws.send_text(json.dumps({
                "finished": True,
                "total_audio_proc_ms": self._cumulative_audio_ms,
            }))

    async def _process_audio_loop(self):
        try:
            pcm_buffer = bytearray()
            window_bytes = 512 * 2

            while True:
                data = await self._audio_queue.get()
                if data is None:
                    break

                pcm_buffer.extend(data)
                self._cumulative_audio_ms += int(len(data) / 2 / SAMPLE_RATE * 1000)

                while len(pcm_buffer) >= window_bytes:
                    window = bytes(pcm_buffer[:window_bytes])
                    del pcm_buffer[:window_bytes]

                    samples = np.frombuffer(window, dtype=np.int16).astype(np.float32) / 32768.0
                    self._vad.accept_waveform(samples)

                    while not self._vad.empty():
                        await self._transcribe_and_emit()

                    if self._vad.is_speech_detected():
                        await self._maybe_emit_partial()

            if self._vad:
                self._vad.flush()
                while not self._vad.empty():
                    await self._transcribe_and_emit()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Processing loop error: {e}")

    async def _transcribe_and_emit(self):
        speech_samples = self._vad.front.samples
        self._vad.pop()

        seg_duration_ms = int(len(speech_samples) / SAMPLE_RATE * 1000)
        seg_end_ms = self._cumulative_audio_ms
        seg_start_ms = max(0, seg_end_ms - seg_duration_ms)

        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, self.manager.decode_samples, speech_samples)
        if not text:
            return

        speaker = "SPEAKER_00"
        if self._diarizer:
            speaker = await loop.run_in_executor(
                None, self._diarizer.identify_speaker, speech_samples, SAMPLE_RATE
            )

        if self.client_ws.client_state != WebSocketState.CONNECTED:
            return

        msg = {
            "type": "turn_end",
            "speaker": speaker,
            "text": text,
            "tokens": [{
                "text": text,
                "is_final": True,
                "speaker": speaker,
                "start_ms": seg_start_ms,
                "end_ms": seg_end_ms,
            }],
        }
        await self.client_ws.send_text(json.dumps(msg))

    async def _maybe_emit_partial(self):
        if self._partial_count >= 60:
            return

        seg = self._vad.current_segment
        cur_audio_sec = len(seg.samples) / SAMPLE_RATE
        if cur_audio_sec < 0.5:
            return

        now = time.time()
        if (now - self._partial_last_emit_wall) < 0.5 or (cur_audio_sec - self._partial_last_audio_sec) < 0.4:
            return

        snapshot = np.array(seg.samples, dtype=np.float32, copy=True)
        self._partial_last_emit_wall = now
        self._partial_last_audio_sec = cur_audio_sec
        self._partial_count += 1

        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, self.manager.decode_samples, snapshot)
        if not text or self.client_ws.client_state != WebSocketState.CONNECTED:
            return

        speaker = f"SPEAKER_{self._diarizer._last_speaker_idx:02d}" if self._diarizer else "SPEAKER_00"
        await self.client_ws.send_text(json.dumps({
            "tokens": [{
                "text": text,
                "is_final": False,
                "speaker": speaker,
            }],
        }))
