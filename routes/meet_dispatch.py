"""Forward authorized Meet requests; original AI processing stays in the worker."""
import os
import httpx
from fastapi.responses import JSONResponse

async def dispatch(request):
    base = os.environ["MEET_WORKER_URL"].rstrip("/")
    if not base.startswith("https://"):
        return JSONResponse({"detail": "Meeting worker URL must use HTTPS."}, status_code=503)
    cors = {"Access-Control-Allow-Origin": "https://adolf-kimkim-pwa.onrender.com"}
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.request(
                request.method, base + request.url.path,
                headers={"Authorization": request.headers.get("authorization", ""),
                         "Content-Type": "application/json"},
                content=await request.body())
        try:
            payload = response.json()
        except ValueError:
            return JSONResponse({"detail": "Meeting worker is starting. Please retry shortly."},
                                status_code=503, headers=cors)
        return JSONResponse(payload, status_code=response.status_code, headers=cors)
    except httpx.HTTPError:
        return JSONResponse({"detail": "Cannot reach meeting worker. Please retry shortly."},
                            status_code=503, headers=cors)
