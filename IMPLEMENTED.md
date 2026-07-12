# IMPLEMENTED

Running log of completed work (newest first). Design rationale lives in
`IMPLEMENT.md`; the remaining backlog in `TO_IMPLEMENT.md`.

## 2026-07-12 — Assessments redesign, backend (IMPLEMENT.md §5)

### Assignment model & CRUD
- `assignments.section_id` (null = whole class), `category`, `batch_id`
  (migration `d8f4a6b2c953`).
- Multi-section publish: `POST /assessments/assignments` takes `section_ids[]`
  — one row per section sharing a `batch_id`; teacher must teach the course in
  every targeted section (timetable-derived, `assignments.create_any`
  bypasses). Response is now a list, name-enriched (class/section/course/
  teacher names — no raw ids).
- `PUT …/{id}` gains `category` + `apply_to_batch` (fan the edit out to all
  batch rows); new `DELETE …/{id}?whole_batch=` removes submissions too —
  the missing delete/modify from the audit.
- List: filters `section_id` (includes class-wide), `category`,
  `created_by_id`, `sort=due_date|created_at|title`; students now see only
  class-wide rows + their own section's (previously any section's).

### Results matrix + export
- `GET /assessments/results/matrix?section_id=|class_id=`: per section —
  courses (with exam types, weightage, and the teacher who teaches that
  course in that section, from §4 slots ∪ legacy assignments), students ×
  courses cells (per-exam marks, weighted score, grade band), per-student
  overall. Class form returns every section.
- Authorization: principal / global `assessments.marks.enter`; teachers only
  for sections they teach.
- `GET /assessments/results/export?format=csv|pdf`: report-style output; each
  section block ends with the "Course → Teacher" summary footer.

Suite: 70 backend tests green (10 new in `test_assessments_redesign.py`).
Frontend `AssessmentsView` redesign (course-wise grading UI, spreadsheet
results with column show/hide) still pending — tracked in TO_IMPLEMENT B8.

## 2026-07-12 — Scope engine (IMPLEMENT.md build-order step 2)

### Timetable as source of truth (§4)
- `timetable_slots.session_id` (migration `c3d8e1f5a927`, backfilled from each
  madrasa's active session). Slot create now: requires the active session,
  validates section∈class and teacher∈tenant, rejects overlapping slots for
  the same teacher or section on a day (409), auto-derives `period` from the
  slot's start-time position when omitted.
- `GET /operations/timetable`: session-scoped, filters (class, section,
  teacher, course, day), responses carry `class_name`/`section_name`/
  `course_name`/`teacher_name` — no more raw UUIDs in the UI.
- `core/teaching_scope.py`: `taught_pairs` / `taught_class_ids` /
  `teacher_teaches` — union of timetable slots and legacy `TeacherAssignment`
  rows. (Implemented as a query helper rather than the DB view sketched in
  IMPLEMENT.md §4 — same semantics, works on sqlite tests too.)
- Consumers switched to derived scope: assessments class+course and course
  checks, attendance class access + roster listing, teacher dashboard
  "my classes" (now includes section names), admin dashboard class counts.
  A timetable slot alone now grants assessment/attendance scope — tested.

### Unified audience targeting (§6)
- Kept the JSONB scope column (decision change from IMPLEMENT.md §6's
  normalized tables — the shape was already there; the resolver is now the
  single implementation). Scope keys: `all`, `roles`, and any-of targeting
  `classes` / `sections` / `courses` / `users`.
- `modules/operations/audience.py`: `get_viewer_context` (student → enrollment
  class/section + class courses; teacher → taught classes/sections/courses via
  §4) + `scope_allows`. Principal/super admin see everything.
- Announcements, resources, and forms list endpoints all filter through the
  resolver. Announcements additionally gained the admin three-tab filter
  (`audience=teachers|students|all`), `q` search, and `date_from`/`date_to`.
- Old `_visible`/`_viewer_class_id` retained only for reporting dashboards
  until those are reworked.

Suite: 60 backend tests green.

## 2026-07-12 — Foundations phase (IMPLEMENT.md build-order step 1)

### Per-user academic-session context (§10a)
- `users.selected_session_id` (nullable FK → academic_sessions, `SET NULL` on
  session delete). Migration `8e4f2b7c1d90`.
- `PATCH /api/v1/auth/me`: set `preferred_language`, `selected_session_id`
  (tenant-validated), or `clear_selected_session` to re-follow the active one.
- `get_context_session` resolution order: `X-Academic-Session-Id` header →
  user's stored preference → active session.
- Frontend: session id no longer in shared localStorage (`mms_session_id`
  removed — the cross-role clobbering bug). `api.ts` holds it in memory and
  sends the header; `AuthContext` syncs it from `/auth/me`;
  `SessionSwitcher` PATCHes the preference (picking the active session clears
  it) and reloads.

### Read-only archived sessions (§10b)
- `require_active_session` dependency + `ensure_writable_session(session,
  madrasa_id, session_id)` payload-level guard (404 wrong tenant / 403 not
  active). Applied to: student enroll, teacher-assignment create, results
  publish. Remaining mutating routes adopt it as their screens are reworked.
- `SessionReadOnlyBanner` under the topbar when viewing a non-active session
  (en + ur strings).

### Permission catalogue + scoped grants (§3 backend)
- New codes: `holidays.manage`, `leave.manage`, `admissions.manage`,
  `settings.manage` (routes regated off the old coarse `timetable.manage` /
  `students.provision` / `academics.manage`).
- `user_permissions.scope_type/scope_id` (migration `9a1c5d3e7f42`):
  grants can target one class/section. `user_has_permission` now requires an
  unscoped grant; `user_has_permission_scoped` accepts matching scoped ones.
- `PUT /auth/permissions/grants` accepts `grants: [{code, scope_type?,
  scope_id?}]` (legacy `permission_codes` still works); audited.
- `GET /auth/users/{id}/permissions` (principal or self).

### Super-admin tier + feature flags (§1)
- `UserRole.super_admin`; `users.madrasa_id` nullable (platform scope).
  `madrasa_features` table (no row = enabled). Migration `b7e9f2a4c611`
  (adds enum value via `ALTER TYPE`).
- Feature catalogue in `core/features.py` (14 module keys).
- `/api/v1/platform/*` (super-admin only): list madaris; onboard madrasa
  (creates tenant + first principal via provision flow + disabled features in
  one call); get/put feature flags. All audited.
- Enforcement: `require_feature(key)` router dependency — attendance,
  assessments, finance, messaging routers gated; operations gets per-route
  gating when its screens split. Principals have **no** write path to
  `madrasa_features` (tested).
- `/auth/me` now returns `features`; sidebar hides nav items whose
  `feature` key is off (`hasFeature` in AuthContext).

### Authz matrix tests (§9.1 start)
- `tests/test_authz_matrix.py`: student and teacher get 403 across privileged
  routes (people, finance, admissions, platform, academics, holidays,
  settings); non-principal cannot grant permissions; cross-tenant student
  fetch returns 404.
- Test-infra fix: `_make_client` resolves the acting user per-request from an
  `X-Test-User-Id` header — two live clients (e.g. principal + super admin in
  one test) no longer clobber each other's `dependency_overrides`.

### Package fixes
- SQLAlchemy 2.0.36 → 2.0.51 (2.0.36 crashes on Python 3.14:
  `typing.Union.__getitem__` TypeError at mapper configuration).

Suite: 51 backend tests green; frontend `tsc --noEmit` clean.
