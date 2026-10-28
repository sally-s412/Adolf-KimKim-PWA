# Adolf KimKim PWA

Responsive VI/EN PWA with light/dark themes, Firebase sign-in and a FastAPI API.

## Preserve the AI engineer's implementation

The Python AI and speech modules are restored byte-for-byte from the user's original ZIP. Keep the original models, providers, prompts, parameters, parsing, diarization, keys and endpoint contracts. Do not substitute models or speech services to fit a hosting budget. Integrity tests compare the original source hashes.

Build: `pip install -r requirements-api.txt`

Start: `uvicorn beta:app --host 0.0.0.0 --port $PORT --workers 1`

The beta entrypoint adds Firebase authentication; it does not rewrite AI payloads or results. Keep the engineer-provided secrets and service endpoints. Read [DEPLOY-BETA-VI.md](DEPLOY-BETA-VI.md) for current infrastructure limits. Speech and meeting workers are not yet fully deployed; restored source does not imply the full AI pipeline is live.

Tests: `python -m unittest discover -s tests -p 'test_*.py'` and `npm test`.
Frontend: `npm run build`.
