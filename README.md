# Madrasa Management System

Initial build from `MMS-SRS.docx`: a FastAPI modular monolith, React PWA, and Next.js public website.

## Workspace

- `backend/` - FastAPI modular monolith with SQLAlchemy models, permission registry, tenant-aware services, and REST routes.
- `app/` - React + Vite PWA for Principal, teacher, and student portals. Includes the first offline attendance outbox.
- `web/` - Next.js public website shell for landing, blog, contact, and admission registration.
- `docker-compose.yml` - Coolify-ready stack with Postgres, Redis, MinIO, backend, worker, PWA, and public site.

## First Local Run

```bash
cp .env.example .env
docker compose up --build
```

For direct development:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

cd app
npm install
cp .env.example .env
npm run dev:host

cd web
npm install
npm run dev:host
```

Local URLs:

- Backend API: `http://localhost:8001`
- PWA: `http://localhost:5173`
- Public site: `http://localhost:3000`

## Build Status

This baseline establishes the architecture and the highest-risk v1 workflows: tenancy, permissions, auth provisioning, academic structure, attendance capture/sync, WhatsApp link generation, and operational dashboards. The next slices should deepen persistence, migrations, and full workflow screens module by module.
