# Adolf KimKim PWA

Responsive VI/EN PWA with light/dark themes, Firebase sign-in and an authenticated FastAPI beta API.

## Free beta server

Build: `pip install -r requirements-api.txt`

Start: `uvicorn beta:app --host 0.0.0.0 --port $PORT --workers 1`

Use the **beta** entrypoint for public deployment; `app:app` alone does not enforce Firebase authentication. Read [DEPLOY-BETA-VI.md](DEPLOY-BETA-VI.md) for environment settings and limits. Set `GROQ_API_KEY` only in hosting secrets. AI is unavailable until configured. Meet worker and realtime STT are not deployed by this beta entrypoint.

## Frontend

`npm run build` builds the current responsive frontend and service worker. Desktop/tablet/mobile share one URL. `npm test` checks PWA packaging. `python -m unittest discover -s tests -p test_beta.py` checks backend authentication with API dependencies installed.
