"""Model Manager for Gipformer ASR, Silero VAD, and Speaker Embedding."""

import logging
import os
import threading
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np
import sherpa_onnx

logger = logging.getLogger("gipformer.model_manager")

SAMPLE_RATE = 16000
SILERO_VAD_URL = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
SPEAKER_EMBEDDING_URL = "https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"


class GipformerModelManager:
    """Manages Gipformer ASR, Silero VAD, and Speaker Embedding models."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        base_dir = Path(__file__).resolve().parent.parent
        self.asr_dir = base_dir / "models" / "gipformer"
        self.vad_dir = base_dir / "models" / "vad"
        self.speaker_dir = base_dir / "models" / "speaker_embedding"

        self._recognizer: Optional[sherpa_onnx.OfflineRecognizer] = None
        self._speaker_extractor: Optional[sherpa_onnx.SpeakerEmbeddingExtractor] = None
        self._vad_path: Optional[Path] = None

    def _ensure_vad(self) -> Path:
        self.vad_dir.mkdir(parents=True, exist_ok=True)
        vad_file = self.vad_dir / "silero_vad.onnx"
        if not vad_file.exists():
            logger.info("Downloading Silero VAD model...")
            urllib.request.urlretrieve(SILERO_VAD_URL, vad_file)
            logger.info("Silero VAD model downloaded.")
        return vad_file

    def _ensure_speaker_model(self) -> Path:
        self.speaker_dir.mkdir(parents=True, exist_ok=True)
        model_file = self.speaker_dir / "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
        if not model_file.exists():
            logger.info("Downloading Speaker Embedding model...")
            urllib.request.urlretrieve(SPEAKER_EMBEDDING_URL, model_file)
            logger.info("Speaker Embedding model downloaded.")
        return model_file

    @property
    def recognizer(self) -> sherpa_onnx.OfflineRecognizer:
        if self._recognizer is None:
            encoder = self.asr_dir / "encoder.onnx"
            decoder = self.asr_dir / "decoder.onnx"
            joiner = self.asr_dir / "joiner.onnx"
            tokens = self.asr_dir / "tokens.txt"

            if not (encoder.exists() and decoder.exists() and joiner.exists() and tokens.exists()):
                raise FileNotFoundError(f"Gipformer model files missing in {self.asr_dir}")

            num_threads = int(os.environ.get("GIPFORMER_NUM_THREADS", "4"))
            self._recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=str(encoder),
                decoder=str(decoder),
                joiner=str(joiner),
                tokens=str(tokens),
                num_threads=num_threads,
                sample_rate=SAMPLE_RATE,
                feature_dim=80,
                decoding_method="greedy_search",
            )
            logger.info("Gipformer recognizer ready.")
        return self._recognizer

    def create_vad(
        self,
        min_silence_duration: float = 0.4,
        min_speech_duration: float = 0.25,
        threshold: float = 0.5,
    ) -> sherpa_onnx.VoiceActivityDetector:
        vad_path = self._ensure_vad()
        config = sherpa_onnx.VadModelConfig()
        config.silero_vad.model = str(vad_path)
        config.silero_vad.min_silence_duration = min_silence_duration
        config.silero_vad.min_speech_duration = min_speech_duration
        config.silero_vad.threshold = threshold
        config.silero_vad.window_size = 512
        config.sample_rate = SAMPLE_RATE
        return sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=30)

    @property
    def speaker_extractor(self) -> sherpa_onnx.SpeakerEmbeddingExtractor:
        if self._speaker_extractor is None:
            model_path = self._ensure_speaker_model()
            config = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
                model=str(model_path),
                num_threads=2,
                provider="cpu",
            )
            self._speaker_extractor = sherpa_onnx.SpeakerEmbeddingExtractor(config)
            logger.info("Speaker embedding extractor ready.")
        return self._speaker_extractor

    def decode_samples(self, samples: np.ndarray) -> str:
        stream = self.recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples)
        self.recognizer.decode_streams([stream])
        text = stream.result.text.strip()
        return text.capitalize() if text else ""
