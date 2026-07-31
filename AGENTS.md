# AGENTS.md

This file is the source of truth for AI agents working in this repository.
Follow it before making any code change.

## Project Context

Suffa-MS is a Madrasa Management System: a FastAPI modular monolith backend, a React + Vite PWA for authenticated portals, and a Next.js public website shell. It is deployed via Docker Compose (Coolify-ready) with Postgres, Redis, and MinIO.

- `backend/` — FastAPI modular monolith with SQLAlchemy async models, Alembic migrations, Pydantic v2, JWT auth, multi-tenancy, permission registry, tenant-aware services, and REST routes.
- `app/` — React + Vite PWA for Principal, teacher, student, and guardian portals. Uses MUI v9, React Router v8, TanStack React Query, i18next (en/ur), Dexie offline storage, and `vite-plugin-pwa`.
- `web/` — Next.js public website shell for landing, blog, contact, and admission registration.
- `docker-compose.yml` — Coolify-ready stack: backend, worker (arq), app, web.

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

## Required Workflow

1. Read the relevant existing code before editing.
2. Identify the user journey affected by the request, not just the single file.
3. Treat every user-reported issue as a pattern to investigate across the project. If the user says an old component, broken behavior, misplaced action, styling mismatch, or data gap exists on one screen, search for the same component, behavior, field, route pattern, or helper everywhere else it appears and fix all relevant connected occurrences in the same pass.
4. Reuse existing components, hooks, route patterns, store helpers, and styles.
5. Keep every change connected to an active route, component, hook, data model, or documented future task.
6. Remove or avoid orphan code: no unused components, hooks, files, exports, CSS, data fields, helpers, assets, routes, or dependencies.
7. Build and verify the affected journey before claiming completion.
8. Update `IMPLEMENTED.md` and `TO_IMPLEMENT.md` as described below.

## Documentation Requirements

Every meaningful change must update these root-level files:

- `IMPLEMENTED.md`: what was completed, where it lives, how it was verified, and any known limitations.
- `TO_IMPLEMENT.md`: remaining work, open questions, deferred follow-ups, and release blockers.

If either file does not exist, create it. Keep entries concise and traceable. Use dates, feature names, file paths, and verification commands. Do not mark a task complete unless the code path is implemented, connected, and verified.

Suggested entry format:

```md
## 2026-07-29 - Staff Profile Tabs

- Implemented: Organized staff edit profile into tabs.
- Files: `app/src/components/PeopleView.tsx`
- Verified: `cd app && npm run build`; browser screenshot of `/people/teachers`.
- Notes: Uploads are stored as prototype file metadata only.
```

## Architecture Rules

### Backend — Modular Monolith

- Keep all backend code under `backend/app/`.
- `backend/app/main.py` creates the FastAPI app, adds middleware, and includes routers. Do not rewrite this factory.
- `backend/app/core/` holds cross-cutting concerns: config, dependencies, permissions, tenancy, logging, pagination, PDF rendering, storage, phone normalization, Hijri dates, settings catalog, teaching scope, feature flags, rate limiting, security.
- `backend/app/modules/` holds domain modules, each with its own `models.py`, `schemas.py`, and `routes.py`. Current modules: `academics`, `assessments`, `attendance`, `auth`, `finance`, `files`, `messaging`, `operations`, `people`, `platform`, `public`, `reporting`.
- `backend/app/db/` holds the SQLAlchemy `Base`, session factory, core models (`FileObject`, `AuditLog`), and migration lock.
- Use `backend/alembic/` for schema migrations. Always produce a reversible migration; never hand-edit `alembic/versions/` after the fact.
- Keep Pydantic schemas close to the routes that use them. Validate at the boundary — phone numbers, dates, money, enums, and cross-field rules belong in schemas.
- Use `asyncpg` + SQLAlchemy async sessions. Never call blocking I/O on the async event loop.
- Multi-tenancy: every mutating route must scope to the authenticated user's `madrasa_id` (or be explicitly super-admin/platform-scoped). Use `get_current_madrasa` from `core/dependencies.py`.
- Permissions: use the `require_*` dependencies and the `user_has_permission` / `user_has_permission_scoped` helpers from `core/permissions.py`. Principals are implicit superusers for their own madrasa's permission codes.
- Feature flags: gate routers with `require_feature(key)` from `core/dependencies.py`. Missing flag row = enabled; flags are subtractive.
- Auth: JWT bearer tokens only — no cookies, no sessions. Use `python-jose` + `argon2-cffi`. The frontend attaches the token via the `Authorization` header.
- File storage: use `core/storage.py` for presigned S3/MinIO uploads. Object keys are tenant-prefixed.
- Background jobs: use `arq` with Redis. Worker entrypoint is `app.worker.WorkerSettings`.
- PDF generation: use `core/pdf.py` (`render_table_pdf`) for all tabular exports. Auto-switch to landscape for wide tables; wrap cell text in `Paragraph`.
- WhatsApp/Evolution: use the Evolution API v2 integration in `core/` and `modules/messaging/`. Never log tokens, phone secrets, or API keys.

### Frontend — React PWA

- Keep all PWA code under `app/src/`.
- `app/src/main.tsx` mounts the provider tree: `ThemeProvider` → `QueryClientProvider` → `AuthProvider` → `DialogProvider` → `SnackbarProvider` → `NavigationGuardProvider` → `BrowserRouter` → `App`. Do not rewrite this tree.
- `app/src/App.tsx` owns routing. Public routes (`/set-password`, `/admission/:token`) render outside the authenticated `Workspace`. All authenticated portal routes live inside `Workspace` and are defined in `app/src/data/mockData.ts` as `portalRoutes`.
- `app/src/data/mockData.ts` is the single source of truth for navigation groups (`navGroups`), navigation items (`navItems`), portal routes (`portalRoutes`), and the access-control helpers (`isPortalRouteAccessible`, `isNavItemAccessible`, `resolveNavItemPath`). Despite the filename, this is routing/permission config — not mock data.
- `app/src/lib/AuthContext.tsx` owns auth state: user, madrasa, permissions, features, `hasPermission`, `hasFeature`, session switching, profile updates. Use `useAuth()` in any component that needs auth context.
- `app/src/lib/ThemeContext.tsx` owns MUI theme state (light/dark). Use `useTheme()` to read or toggle.
- `app/src/lib/api.ts` owns the Axios instance. All API calls go through `api` or the endpoint functions in `app/src/lib/endpoints.ts`.
- `app/src/lib/DialogContext.tsx` owns the application dialog system. Use `useDialog()` for confirm/alert/prompt — never `window.alert`, `window.confirm`, or `window.prompt`.
- `app/src/components/ui/` holds shared UI primitives: `Button`, `AsyncState` (LoadingState/ErrorState/EmptyState), `Snackbar`, `Dialog`, `ActionMenu`, `InlineFilter`, `AudiencePicker`, `HijriTag`, `SessionSwitcher`, `PwaStatus`, `InstallPrompt`, `DelegateButton`, `NavDrawer`, `Sidebar`, `BottomTabBar`, `AppBar`.
- `app/src/components/` holds feature views: `PeopleView`, `AcademicsView`, `AssessmentsView`, `AttendanceBoard`, `TimetableView`, `FinanceView`, `AdmissionsView`, `FormsView`, `ResourcesView`, `AnnouncementsView`, `HolidaysView`, `LeaveView`, `SalaryView`, `BlogView`, `ReportsView`, `SettingsView`, `PlatformView`, `ProfileView`, `DashboardCards`, `RolloverWizard`, `LoginScreen`, `SetPasswordPage`, `PublicAdmissionPage`, `NotFoundView`.
- Use MUI v9 (`@mui/material`) for all UI components. Do not introduce Tailwind, styled-components, or other CSS frameworks.
- Use `styled()` and `sx` from MUI for component styling. Do not add one-off CSS files or inline styles unless there is no existing pattern.
- Use `lucide-react` for icons.
- Use `i18next` + `react-i18next` for all user-facing strings. Every label, button, heading, error, and empty state must have English (`en`) and Urdu (`ur`) translations in `app/src/i18n/index.ts`.
- Support RTL: Urdu renders right-to-left. The `ThemeProvider` and `main.tsx` set `document.documentElement.dir` automatically. Test both LTR and RTL for layout changes.
- Use TanStack React Query (`@tanstack/react-query`) for server state. Use `useQuery` / `useMutation` for API calls that fetch or mutate data.
- Use Dexie (`dexie`) for offline storage. The offline attendance outbox and profile cache are the primary consumers.
- Use `vite-plugin-pwa` for service worker and manifest. The PWA shell must work offline for cached dashboards and timetables.
- Route-based code splitting: `App.tsx` lazy-loads feature views. Keep this pattern for new views.
- Mobile and desktop layouts must both be usable. The sidebar becomes a drawer on mobile; the bottom tab bar appears on mobile. Forms stack cleanly. Tables do not create unusable overflow. Button text fits.
- Use 44px minimum touch targets for primary actions (already configured in MUI theme).

### Routes

- The PWA uses React Router v8 (`react-router`) with `BrowserRouter`. Routes are defined in `app/src/data/mockData.ts` as `portalRoutes`.
- Do not create `src/pages`, `app`, or Next/Remix-style route files in the PWA.
- Each route has a `view` (maps to a component in `App.tsx`'s `renderRoute`), optional `permission`, `permissionsAny`, `feature`, `roles`, and `implicitTeacher` gates.
- Access control is centralized in `isPortalRouteAccessible` — do not duplicate permission checks in components.
- For nested routes (e.g., `/people/students`, `/academics/programs`), the parent `PeopleView`/`AcademicsView` component renders tabs based on the URL.
- `app/src/routeTree.gen.ts` is not used (React Router, not TanStack Router). Do not create it.

### Data and Types

- Keep TypeScript types close to the data they describe.
- Backend SQLAlchemy models live in `backend/app/modules/<module>/models.py` and are re-exported from `backend/app/db/models.py`.
- Backend Pydantic schemas live in `backend/app/modules/<module>/schemas.py`.
- Frontend types for auth (`User`, `Madrasa`) live in `app/src/lib/AuthContext.tsx`.
- Frontend types for routing (`ViewId`, `NavItem`, `PortalRoute`) live in `app/src/data/mockData.ts`.
- When adding fields to shared models (User, TeacherProfile, StudentProfile, Guardian, etc.), update all affected create/edit/detail/list surfaces on both backend and frontend.
- Seed mock data only when it demonstrates a real connected flow. Use `backend/seed.py`, `backend/seed_full.py`, or `backend/seed_academics.py`.
- Do not add placeholder data that is never rendered or used.
- Do not silently change existing custom flows; extend them after understanding their current behavior.

### Styling and UI Consistency

- Use the MUI v9 theme tokens defined in `app/src/theme.ts` (light/dark palettes, custom palette slots: teal, gold, saffron, leaf, rose).
- Use `lucide-react` icons for actions when an icon exists.
- Keep buttons, inputs, selects, tabs, dialogs, and tables visually consistent with the rest of the app.
- Do not add one-off CSS or inline styles unless there is no existing pattern.
- Mobile and desktop layouts must both be usable. Forms should stack cleanly, tables should not create unusable overflow, and button text must fit.
- Prefer tabs for large edit forms with independent sections.
- Use the shared `ActionMenu` for table row actions (never raw buttons per action).
- Use the shared `InlineFilter` for filter toolbars.
- Use the shared `Dialog` (from `DialogContext`) for confirmations and alerts.
- Use the shared `Snackbar` (from `SnackbarProvider`) for mutation success/failure notifications.

### No Loose Code

Code is loose if it has no connected purpose. Do not leave:

- unused files, functions, components, hooks, types, constants, imports, CSS, or assets;
- route files that are unreachable;
- feature flags with no caller or documented rollout plan;
- mock fields that are not rendered, saved, or listed in `TO_IMPLEMENT.md`;
- duplicate components that should be one shared component;
- dead TODO comments without a matching `TO_IMPLEMENT.md` entry;
- independent experiments inside production routes.

If exploratory code is useful but not ready, either connect it properly or move the remaining work into `TO_IMPLEMENT.md` and remove the unused code.

## Feature Implementation Standard

For every feature or fix:

1. Trace the affected journey end to end.
2. Search for related occurrences across the repository before editing. Use exact strings, component names, route names, data-field names, CSS classes, and helper names to find every connected surface that may share the same issue.
3. Fix the issue across all relevant connected surfaces, not only the screenshot or route the user mentioned. If a full rollout would be risky or too large, implement the active/related surfaces now and document the remaining surfaces with acceptance criteria in `TO_IMPLEMENT.md`.
4. Update the data model, edit surface, detail surface, list surface, and any linked actions together when they represent the same concept.
5. Prefer shared components and hooks when multiple screens need the same behavior.
6. Keep action placement aligned with product boundaries. For example, staff clock-in/clock-out belongs on the attendance screen, not staff management or profile pages.
7. Ensure buttons work from the surface where they appear.
8. Remove obsolete controls when behavior moves to another screen.
9. Verify the route in a browser for UI changes, including mobile when layout may be affected.

## Verification

At minimum, run:

```sh
# Backend
cd backend && .venv/bin/python -m pytest tests/ -q

# Frontend
cd app && npm run build
```

For UI work, also verify affected routes in a browser. Capture screenshots when visual layout, responsive behavior, forms, or navigation changed.

Before finalizing, check:

- no TypeScript/build errors;
- no broken route/navigation path;
- no visible action that does nothing;
- no unused imports introduced by the change;
- no unrelated user work was reverted;
- `IMPLEMENTED.md` and `TO_IMPLEMENT.md` are updated.

## Git and Worktree Safety

- The worktree may already contain user changes. Do not revert unrelated edits.
- Do not use destructive git commands unless the user explicitly asks.
- Keep diffs focused on the requested feature and required connected cleanup.
- Mention unrelated dirty files in the final response when relevant.

## Agent Handoff Notes

When handing work back to the user or another agent, include:

- what changed;
- where it changed;
- how it was verified;
- what remains in `TO_IMPLEMENT.md`;
- any assumptions or limitations.

Do not claim completion from a build alone when the user-facing journey was not checked.
