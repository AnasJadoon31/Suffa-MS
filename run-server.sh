#!/usr/bin/env bash
#
# Local non-Docker runner for Suffa-MS.
#
# This script starts the FastAPI backend and the Vite PWA frontend together.
# It is intentionally verbose because future AI agents should be able to run
# the project without rediscovering ports, env files, migrations, or shutdown
# behavior.
#
# What it does:
#   1. Ensures backend/.env and app/.env exist, without overwriting them.
#   2. Creates backend/.venv when missing and installs Python dependencies.
#   3. Installs frontend npm dependencies when app/node_modules is missing.
#   4. Runs Alembic migrations and backend/bootstrap.py.
#   5. Starts backend on BACKEND_PORT (default 8001).
#   6. Starts frontend on FRONTEND_PORT (default 5173).
#
# What it does NOT do:
#   - It does not start Postgres, Redis, or MinIO. For no-Docker local runs,
#     install/start those services yourself or point DATABASE_URL/REDIS_URL/S3_*
#     in backend/.env to services that already exist.
#   - It does not overwrite existing .env files.
#
# Common usage:
#   ./run-server.sh
#
# Useful overrides:
#   BACKEND_PORT=8010 FRONTEND_PORT=5174 ./run-server.sh
#   SKIP_INSTALL=1 ./run-server.sh
#   SKIP_MIGRATIONS=1 SKIP_BOOTSTRAP=1 ./run-server.sh
#
# Expected URLs:
#   Backend API: http://127.0.0.1:8001
#   API docs:    http://127.0.0.1:8001/docs
#   PWA:         http://127.0.0.1:5173

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/app"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
SKIP_BOOTSTRAP="${SKIP_BOOTSTRAP:-0}"

BACKEND_PID=""
FRONTEND_PID=""

log() {
  printf '[run-server] %s\n' "$*"
}

die() {
  printf '[run-server] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command '$1'. Install it, then rerun this script."
}

copy_env_if_missing() {
  local env_file="$1"
  local example_file="$2"

  if [[ -f "$env_file" ]]; then
    log "Using existing ${env_file#$ROOT_DIR/}"
    return
  fi

  if [[ -f "$example_file" ]]; then
    cp "$example_file" "$env_file"
    log "Created ${env_file#$ROOT_DIR/} from ${example_file#$ROOT_DIR/}; review secrets and service URLs if startup fails."
  else
    die "Cannot create ${env_file#$ROOT_DIR/}; missing ${example_file#$ROOT_DIR/}."
  fi
}

create_backend_env_if_missing() {
  local env_file="$BACKEND_DIR/.env"

  if [[ -f "$env_file" ]]; then
    log "Using existing ${env_file#$ROOT_DIR/}"
    return
  fi

  cat >"$env_file" <<EOF
# Local development defaults for ./run-server.sh.
# This file is intentionally non-production and is never overwritten by the script.
ENVIRONMENT=development
SECRET_KEY=dev-only-change-me
DATABASE_URL=postgresql+asyncpg://mms:mms_password@localhost:5432/mms
REDIS_URL=redis://localhost:6379/0
DEFAULT_TENANT=default
MADRASA_NAME=Suffa Madrasa
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=password
SUPER_ADMIN_USERNAME=platform-admin
SUPER_ADMIN_PASSWORD=password
CORS_ORIGINS=http://127.0.0.1:$FRONTEND_PORT,http://localhost:$FRONTEND_PORT

# Optional local S3-compatible storage. Leave blank to keep upload endpoints disabled.
S3_ENDPOINT=
S3_PUBLIC_URL=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=mms-files

# Optional Evolution API v2 settings for WhatsApp flows.
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=
EVOLUTION_TENANT_SLUG=
EOF
  log "Created backend/.env with local development defaults. Update DATABASE_URL/REDIS_URL if your services use different credentials."
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-45}"

  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$label is ready at $url"
      return 0
    fi
    sleep 1
  done

  die "$label did not become ready at $url. Check the logs above for the first failing process."
}

cleanup() {
  log "Stopping local servers..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

require_command python3
require_command npm
require_command curl

create_backend_env_if_missing
copy_env_if_missing "$FRONTEND_DIR/.env" "$FRONTEND_DIR/.env.example"

log "Backend will run on http://$BACKEND_HOST:$BACKEND_PORT"
log "Frontend will run on http://$FRONTEND_HOST:$FRONTEND_PORT"

cd "$BACKEND_DIR"

if [[ ! -d ".venv" ]]; then
  log "Creating backend virtual environment at backend/.venv"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source "$BACKEND_DIR/.venv/bin/activate"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  log "Installing backend dependencies from backend/requirements.txt"
  python -m pip install -r requirements.txt
else
  log "Skipping backend dependency install because SKIP_INSTALL=1"
fi

# Export local defaults used by both Alembic/bootstrap and the API process.
# Existing values from the shell or backend/.env still win inside Pydantic.
export ENVIRONMENT="${ENVIRONMENT:-development}"
export API_BASE="${API_BASE:-http://$BACKEND_HOST:$BACKEND_PORT}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://$FRONTEND_HOST:$FRONTEND_PORT,http://localhost:$FRONTEND_PORT}"

if [[ "$SKIP_MIGRATIONS" != "1" ]]; then
  log "Running backend migrations: alembic upgrade head"
  alembic upgrade head
else
  log "Skipping migrations because SKIP_MIGRATIONS=1"
fi

if [[ "$SKIP_BOOTSTRAP" != "1" ]]; then
  log "Running idempotent backend bootstrap"
  python bootstrap.py
else
  log "Skipping bootstrap because SKIP_BOOTSTRAP=1"
fi

log "Starting FastAPI backend"
uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT" &
BACKEND_PID="$!"

wait_for_http "http://$BACKEND_HOST:$BACKEND_PORT/healthz" "Backend"

cd "$FRONTEND_DIR"

if [[ "$SKIP_INSTALL" != "1" && ! -d "node_modules" ]]; then
  log "Installing frontend dependencies with npm install"
  npm install
elif [[ "$SKIP_INSTALL" == "1" ]]; then
  log "Skipping frontend dependency install because SKIP_INSTALL=1"
else
  log "Using existing app/node_modules"
fi

# Vite reads VITE_API_BASE from app/.env. This export keeps overrides easy for
# agents and humans running this script with non-default ports.
export VITE_API_BASE="${VITE_API_BASE:-http://$BACKEND_HOST:$BACKEND_PORT}"

log "Starting Vite PWA frontend"
npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" &
FRONTEND_PID="$!"

wait_for_http "http://$FRONTEND_HOST:$FRONTEND_PORT" "Frontend"

cat <<EOF

Suffa-MS is running without Docker:
  Backend API: http://$BACKEND_HOST:$BACKEND_PORT
  API docs:    http://$BACKEND_HOST:$BACKEND_PORT/docs
  PWA:         http://$FRONTEND_HOST:$FRONTEND_PORT

Press Ctrl+C to stop both processes.
EOF

wait "$BACKEND_PID" "$FRONTEND_PID"
