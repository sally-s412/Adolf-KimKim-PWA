FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=2609

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn==0.30.6 \
    websockets==12.0 \
    numpy>=1.26.0 \
    sherpa-onnx==1.13.2 \
    onnxruntime==1.24.4 \
    python-multipart

RUN python -c "import onnxruntime; from pathlib import Path; capi = Path(onnxruntime.__file__).parent / 'capi'; (capi / 'libonnxruntime.so').symlink_to('libonnxruntime.so.1.24.4') if not (capi / 'libonnxruntime.so').exists() else None"

ENV LD_LIBRARY_PATH="/usr/local/lib/python3.11/site-packages/onnxruntime/capi"

COPY . /app

EXPOSE 2609

CMD ["python", "app.py"]
