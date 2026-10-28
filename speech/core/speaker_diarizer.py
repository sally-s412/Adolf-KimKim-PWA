"""Speaker Diarizer — Online speaker clustering using sherpa-onnx SpeakerEmbeddingExtractor."""

from typing import List, Optional
import numpy as np
import sherpa_onnx

SAMPLE_RATE = 16000


class SpeakerDiarizer:
    """Online speaker clustering using sherpa-onnx SpeakerEmbeddingExtractor."""

    def __init__(
        self,
        extractor: sherpa_onnx.SpeakerEmbeddingExtractor,
        threshold: float = 0.45,
        max_speakers: Optional[int] = 4,
        min_segment_duration: float = 0.5,
    ):
        self._extractor = extractor
        self._threshold = threshold
        self._max_speakers = max_speakers
        self._min_segment_duration = min_segment_duration
        self._speaker_centroids: List[np.ndarray] = []
        self._speaker_counts: List[int] = []
        self._last_speaker_idx: int = 0

    def identify_speaker(self, speech_samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> str:
        seg_duration = len(speech_samples) / sample_rate
        if seg_duration < self._min_segment_duration:
            return f"SPEAKER_{self._last_speaker_idx:02d}"

        embedding = self._extract_embedding(speech_samples, sample_rate)
        if embedding is None:
            return f"SPEAKER_{self._last_speaker_idx:02d}"

        speaker_idx = self._assign_speaker(embedding)
        self._last_speaker_idx = speaker_idx
        return f"SPEAKER_{speaker_idx:02d}"

    def _extract_embedding(self, samples: np.ndarray, sample_rate: int) -> Optional[np.ndarray]:
        stream = self._extractor.create_stream()
        stream.accept_waveform(sample_rate, samples)
        stream.input_finished()
        if not self._extractor.is_ready(stream):
            return None
        return np.array(self._extractor.compute(stream))

    def _assign_speaker(self, embedding: np.ndarray) -> int:
        if not self._speaker_centroids:
            self._speaker_centroids.append(embedding.copy())
            self._speaker_counts.append(1)
            return 0

        similarities = []
        for centroid in self._speaker_centroids:
            norm_product = np.linalg.norm(embedding) * np.linalg.norm(centroid)
            if norm_product < 1e-8:
                similarities.append(0.0)
            else:
                similarities.append(float(np.dot(embedding, centroid) / norm_product))

        max_sim = max(similarities)
        best_idx = similarities.index(max_sim)

        at_capacity = (
            self._max_speakers is not None
            and len(self._speaker_centroids) >= self._max_speakers
        )

        if max_sim >= self._threshold or at_capacity:
            count = self._speaker_counts[best_idx]
            self._speaker_centroids[best_idx] = (
                self._speaker_centroids[best_idx] * count + embedding
            ) / (count + 1)
            self._speaker_counts[best_idx] += 1
            return best_idx
        else:
            self._speaker_centroids.append(embedding.copy())
            self._speaker_counts.append(1)
            return len(self._speaker_centroids) - 1

    def reset(self):
        self._speaker_centroids.clear()
        self._speaker_counts.clear()
        self._last_speaker_idx = 0
