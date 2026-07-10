#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
alembic upgrade head

echo "[entrypoint] running bootstrap..."
python bootstrap.py

echo "[entrypoint] starting server..."
exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000 --timeout 120
