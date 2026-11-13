#!/bin/sh
set -eu
pulseaudio --start --exit-idle-time=-1
exec uvicorn meeting_server:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
