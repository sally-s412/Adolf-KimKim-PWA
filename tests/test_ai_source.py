"""Integrity guard for the AI engineer's supplied implementation."""
import hashlib
import json
import unittest
from pathlib import Path

class AISourceIntegrityTests(unittest.TestCase):
    def test_engineer_ai_source_is_unchanged(self):
        root = Path(__file__).resolve().parent.parent
        expected = json.loads((root / 'tests/ai-source.sha256.json').read_text())
        for path, sha in expected.items():
            with self.subTest(path=path):
                self.assertEqual(hashlib.sha256((root / path).read_bytes()).hexdigest(), sha)
