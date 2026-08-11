# Suffa MS

Suffa MS is a multi-tenant Madrasa Management System for running the academic,
operational, financial, and communication workflows of a madrasa from one
mobile-first workspace.

It provides role-aware portals for principals, teachers, students, guardians,
donors, admissions staff, and platform super administrators. The application
supports multiple madaris, each with isolated data, feature access, branding,
academic sessions, and WhatsApp connection.

## Highlights

- Multi-tenant management with a dedicated super-admin Platform workspace.
- People management for students, guardians, teachers, donors, and staff.
- Program → Class → Course academic hierarchy with sections and sessions.
- Student promotion and session rollover workflows.
- Student and teacher attendance, leaves, history corrections, and school-day settings.
- Teacher-scoped timetables, assessments, assignment submission, marking, and results publishing.
- Admissions forms, public submission links, application review, and enrollment.
- Finance workflows for fees, donations, salary, receipts, and reporting.
- Tenant-scoped Evolution API WhatsApp pairing and messaging.
- File uploads through S3-compatible storage and a responsive PWA portal.
- English and Urdu support, including right-to-left layout.

## Architecture

| Area | Technology | Purpose |
| --- | --- | --- |
| `backend/` | FastAPI, SQLAlchemy async, Alembic, PostgreSQL | Tenant-aware REST API and domain services |
| `app/` | React 19, TanStack Start, Vite, React Query | Authenticated PWA portal |
| `web/` | Next.js | Public website and admission entry points |
| `worker` | ARQ, Redis | Background jobs |
| Storage | MinIO or compatible S3 service | Uploaded files and generated documents |
| Messaging | Evolution API v2 | WhatsApp pairing, messages, and receipts |

The backend is a modular monolith. Domain code lives under
`backend/app/modules/`, while shared authentication, tenancy, permissions,
storage, messaging, and session concerns live in `backend/app/core/`.

## Repository Layout

```text
backend/                 FastAPI API, migrations, tests, seed scripts
  app/modules/           Academics, people, attendance, assessments, finance, and more
  alembic/               Schema migrations
app/                     Authenticated mobile-first PWA
web/                     Public Next.js website
docker-compose.yml       Production-oriented local/Coolify stack
.env.example             Environment variable reference
IMPLEMENTED.md           Completed work and verification evidence
TO_IMPLEMENT.md          Open work and release gates
```

## Quick Start with Docker

### Prerequisites

- Docker Engine with Docker Compose v2
- A populated `.env` file based on `.env.example`

### Run the stack

```bash
cp .env.example .env
# Set strong, environment-appropriate values in .env before deployment.
docker compose up --build
```

The backend container automatically applies Alembic migrations and runs
bootstrap provisioning before starting.

| Service | Local URL |
| --- | --- |
| API | http://localhost:8001 |
| PWA | http://localhost:5173 |
| Public website | http://localhost:3000 |
| API health | http://localhost:8001/healthz |
| API readiness | http://localhost:8001/readyz |

Use `/healthz` for process health. `/readyz` additionally checks the database
and is intended for diagnostics.

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

The backend reads configuration from the environment. Export the required
variables or load the repository `.env` in your shell before running it.

### Authenticated PWA

```bash
cd app
npm install
VITE_API_BASE=http://localhost:8001 npm run dev:host
```

The default Vite address is printed by the dev server. Use port `8080` when
you need a stable alternate local port:

```bash
VITE_API_BASE=http://localhost:8001 npm run dev:host -- --port 8080
```

### Public Website

```bash
cd web
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8001 npm run dev:host
```

## Configuration

Start from `.env.example`; do not commit a populated `.env` file. Important
settings include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Async PostgreSQL connection string |
| `REDIS_URL` | Redis connection for worker and background jobs |
| `SECRET_KEY` | JWT signing secret; use a strong random value |
| `DEFAULT_TENANT` | Slug for the platform/default tenant |
| `BOOTSTRAP_ADMIN_*` | Initial tenant administrator credentials |
| `SUPER_ADMIN_*` | Optional Platform super-admin credentials |
| `API_BASE` | API URL compiled into the PWA and public site Docker builds |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `MINIO_*` | S3-compatible file storage settings |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Evolution API v2 server credentials |

Evolution credentials are environment-level configuration. Each madrasa gets
its own Evolution instance automatically, named from that madrasa's slug; the
instance name is not configured through the UI.

## Tenancy and Access

Every authenticated API request is scoped to a madrasa. The PWA sends the
active tenant through the `X-Madrasa` header and a JWT bearer token through
`Authorization`.

- Tenant usernames are scoped to their own madrasa, so different madaris may
  use the same username.
- A super-admin signs in through the `default` tenant and begins in the
  Platform workspace at `/platform`.
- Opening a madrasa from Platform enters its tenant workspace, where its
  feature switches, branding, data, and WhatsApp instance apply.
- Principals are implicit superusers inside their own madrasa. Other roles are
  governed by the permission registry and their teaching scope.

## Academic Model

The academic structure is intentionally hierarchical:

```text
Program
└── Class
    ├── Section
    └── Course
```

Courses are assigned per class, not per program. Timetable slots, teacher
assignments, assessments, results, and student enrollment all resolve against
the selected class and section in the active academic session.

## Database Migrations and Seed Data

Apply schema migrations with:

```bash
cd backend
.venv/bin/alembic upgrade head
```

The full development fixture creates a complete one-year madrasa dataset with
profiles, attendance, timetable entries, assessments, finances, and results:

```bash
cd backend
.venv/bin/python seed_full.py
```

> Warning: `seed_full.py` truncates madrasa data. Run it only against a local
> or disposable development database.

## Quality Checks

Run the focused checks relevant to your change before opening a pull request:

```bash
# Backend tests
cd backend
.venv/bin/python -m pytest tests/ -q

# Frontend production build
cd app
npm run build
```

For visible changes, also verify the affected route in a browser at mobile,
compact tablet, and desktop widths. Confirm both English and Urdu/RTL where
layout or copy is affected.

`IMPLEMENTED.md` records completed work and verification evidence.
`TO_IMPLEMENT.md` is the source of truth for remaining work and release gates.

## Deployment Notes

`docker-compose.yml` is designed for Coolify-compatible deployment. Before
production deployment:

1. Set strong unique values for secrets, database passwords, and bootstrap accounts.
2. Configure managed or persistent PostgreSQL, Redis, and S3-compatible storage.
3. Set public `API_BASE`, `NEXT_PUBLIC_API_BASE`, CORS origins, and storage URLs.
4. Confirm `/healthz` and `/readyz` after deployment.
5. Pair and verify the WhatsApp instance independently for each madrasa.
6. Back up PostgreSQL and object storage before running migrations or imports.

## Contributing

Read `AGENTS.md` before making changes. Keep modifications tenant-aware,
permission-checked, connected across API and UI surfaces, and covered by the
appropriate migration and verification work. Avoid committing secrets,
generated build output, or unrelated worktree changes.

## License

This repository is proprietary. All rights reserved.
