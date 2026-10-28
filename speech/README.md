# Gipformer1.5 - 68M - Self hosted STT model
### Offering HTTP + WebSocket
---
### Starter guide
```bash
cd speech

# Build image
docker build -t adolf-kimkim-stt-gipformer-v1.5 .

# Spin up the service
docker run -d --name adolf-kimkim-stt-gipformer-v1.5 -p 2609:2609 gipformer-stt
```
---
### Usage
```bash
# File upload transcription
curl -s -X POST -F "file=@phong.wav" http://localhost:2609/v1/audio/transcriptions

# WebSocket real-time STT
ws://localhost:2609/v1/ws/realtime-speech
```