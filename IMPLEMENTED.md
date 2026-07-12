# IMPLEMENTED

Running log of completed work (newest first). Design rationale lives in
`IMPLEMENT.md`; the remaining backlog in `TO_IMPLEMENT.md`.

## 2026-07-12 — Frontend phase 4 / finish (PWA, i18n sweep, exports)

- **Timetable PDF export**: `GET /operations/timetable/export` — whole-madrasa
  weekly grids (one time-window × days block per section, stacked in
  class/section order), optional `class_id` filter; "Export PDF" button on the
  Timetable screen. Tested (83rd backend test).
- **PWA re-enabled properly**: `vite-plugin-pwa` with `registerType:
  autoUpdate` (replaces the old kill-switch service worker that was parked to
  fight stale bundles), manifest + placeholder icons, network-first runtime
  caching for API GETs (offline dashboards/timetables), iOS meta tags.
- **Mobile**: sidebar becomes an off-canvas drawer (hamburger in the topbar,
  RTL-aware), dashboard gains a role-aware quick-links grid on small screens.
- **i18n sweep complete**: FinanceView, SalaryView, ReportsView, BlogView,
  ResourcesView, FormsView, RolloverWizard, LoginScreen, SetPasswordPage —
  every view now renders through i18next in English and Urdu.
  (~130 new strings this pass.)
- **BlogView**: table → cards with publish/edit/delete (B16-a/b done).
- **ReportsView**: report-centre layout with per-report cards; salary and
  donations reports wired (B15).
- **FinanceView**: class/category/date filters on contributions (B13-a),
  donation filters, all translated.
- **AudiencePicker** (§6 UI): shared everyone/teachers/students/classes/
  sections control, wired into resource and form creation.
- **RolloverWizard**: copy-options checkboxes (teacher assignments, timetable,
  holidays + date-shift) matching the B7-h backend.

## 2026-07-12 — Frontend phase 3 (dashboards, academics merge, admissions split)

- **Student dashboard redesigned** (Student-1): metric cards (overall score,
  due assignments, attendance ratio), own-attendance **calendar** (backend now
  ships `my_attendance` — last 62 days of statuses — on the student
  dashboard payload), two-column layout with timetable/assignments/
  announcements/resources. All translated.
- **Teacher dashboard**: "My classes" panel listing class/section/course with
  one-click jump to the class list (attendance) and assessments (Teacher-1).
- **AcademicsView** (B7-d/j): Sections tab merged into Classes (sections +
  course mapping managed under the class list); Teacher Assignments tab
  removed — assignments live on the Timetable screen.
- **AdmissionsView split** (B12): three tabs — *Registrations* (walk-in form +
  applications with Walk-in/Public-form source column), *Public forms*
  (create per-program admission form, copy shareable public link,
  close/reopen), *Enquiries* (contact-form inbox). Review gate moved to
  `admissions.manage`.

## 2026-07-12 — Frontend phase 2 (timetable, people, delegation, platform)

- **TimetableView rebuilt** (B3): Weekly grid is the first/default tab; List
  gains class/section/course/teacher/day filters and uses server-side names;
  slot create drops manual period (auto-derived); new **By teacher** tab
  showing who teaches which course in which class/section (B7-j); new
  **Import** tab — paste CSV lines, dry-run with per-row errors, commit only
  when all rows pass. Teachers see only the grid, restricted to their own
  sections (Teacher-4).
- **PeopleView rebuilt** (§11/B11/B13): four tabs — Teachers, Students,
  Guardians, **Donators**. Row actions: view-detail (eye) + login-link.
  Teacher detail shows formal record + salary history + record-payment form;
  student detail shows guardians + fee history + record-fee form; donator
  detail shows donation history + add-donation form. Add-teacher/add-student
  forms capture formal fields (CNIC/B-form, address, emergency contact,
  qualifications, joining date). Students filterable by class. Guardians tab
  creates guardians and issues **guardian portal logins** (B7-k).
- **Delegation modal** (§3/B0): "Delegate…" button in every admin screen
  header (principal only) — pick a teacher, tick that screen's feature codes,
  optional class scope; grants for other screens are preserved.
- **Platform console** (§1): super-admin login now lands on a dedicated
  screen — onboard madrasa (name/slug/principal) and toggle per-madrasa
  feature flags.
- All new UI translated (en+ur), modal/detail/import styles added.

## 2026-07-12 — Frontend phase 1 (assessments + settings + filter UIs)

- **AssessmentsView rebuilt** (B8 d–e):
  - *Assignments*: filter bar (class/section/course/category/sort), create
    form with per-section multi-publish checkboxes + category, edit modal with
    "apply to every section copy", delete with whole-batch confirm, list shows
    names (class/section/course/teacher) — no UUIDs.
  - *Grading*: course-wise — pick class → section tabs → course dropdown;
    spreadsheet of students × exam types with inline mark cells (save on
    blur/Enter), computed score + band columns; scheme/exam-type setup folded
    behind a "Grading setup" toggle.
  - *Results*: class picker → per-section sheets with course column show/hide,
    publish-section button, per-student result-card/WhatsApp actions, CSV/PDF
    export, and the course→teacher footer.
- **SettingsView rebuilt** (§7): categorized typed controls from
  `/operations/settings/catalog` (bool → yes/no select, int → number), save on
  blur with tick feedback. Key/value editor gone.
- **HolidaysView**: category + per-class scoping (checkbox picker) on
  create/edit, filter bar (category/class/date range), "applies to" column.
- **LeaveView**: All/Teachers/Students tabs, status + class + date-range
  server filters (kept client search); manage gate fixed to `leave.manage`.
- **AnnouncementsView**: All/Teachers/Students tabs, server search + date
  filters.
- **Nav**: student no longer sees Admissions/Blog (role gating on nav items,
  on top of feature + permission gating).
- **Global**: checkbox/radio normalised to 1rem (the "huge checkboxes" bug);
  new `filterBar`/`sheet`/`settingsRow` styles; ~60 new i18n strings in en+ur.

Frontend still pending: TimetableView (grid-first + import UI), PeopleView
reorganisation, super-admin screen, delegation modal, dashboards redesign,
full i18n sweep of untouched views, PWA/mobile.

## 2026-07-12 — Backend completion sweep (pre-frontend)

Migrations `e5a1c7d9b304`, `f1b6d8e3a742`, `a2c4e6b8d150`. 82 tests green
(12 new in `test_backend_sweep.py`).

- **Auth/personal settings**: `POST /auth/change-password` (verifies current,
  audited). Guardian logins (B7-k): `UserRole.parent`, `guardians.user_id`,
  `POST /people/guardians/{id}/credentials-link` (provision first time,
  re-issue after).
- **People §11**: formal-record fields — teacher CNIC/address/emergency
  contact/photo; student B-form/address/photo; guardian CNIC/address — across
  models, schemas, create/update routes. `GET /people/students/{id}/guardians`.
- **Holidays B4**: `category` + `class_ids` scoping + list filters
  (category/class/date range); attendance summaries count class-scoped
  holidays only for students of those classes.
- **Leave B5**: `person_type` (teacher/student tabs), `status`, `class_id`,
  date range, name search on `GET /operations/leave`; manage gate fixed to
  `leave.manage`.
- **Attendance B2**: verified existing `/attendance/override` already covers
  teacher subjects incl. check-in/out — admin override is a UI-only gap.
- **Finance B13**: payments filterable by `class_id` (active-session
  enrollment); donations by category/date range.
- **Public endpoints B12/B16** (`/api/v1/public`, token-keyed, rate-limited
  with honeypots): `POST /contact/{public_key}` (W3Forms-style;
  `madaris.public_key`), `GET /blog/{public_key}` published feed, admission
  forms — admin CRUD `/operations/admission-forms` (per program, unique
  `public_token`), public `GET`/`POST /admission-forms/{token}` landing in
  the Registrations tab (`form_id` + `extra_data` on applications). Blog got
  the missing `PUT`/`DELETE`.
- **Rollover B7-h**: `copy_timetable` (slots re-stamped onto the new session)
  and `copy_holidays` (+`shift_holiday_dates` shifts by the session-start
  gap) options on the rollover request.
- **Timetable import B3-b**: `POST /operations/timetable/import` — name-based
  rows, dry-run with per-row errors, batch+DB conflict detection,
  auto-periods; nothing commits unless every row is valid.
- **Settings §7**: typed catalogue (`core/settings_catalog.py` — profile /
  security incl. per-role idle timeouts / academics / attendance / finance /
  portal), `GET /operations/settings/catalog` (categorised, defaults merged),
  `PUT /operations/settings` now rejects unknown keys and type-invalid values.
- **Reports B15**: `/reporting/reports/salary` and `/reporting/reports/donations`
  (CSV/PDF, date-ranged, donor filter).
- **Security §9**: security-headers middleware (nosniff, frame-deny,
  referrer-policy, HSTS in prod), API docs disabled outside development
  (`ENVIRONMENT` env var), generic `enforce_rate_limit` for public routes.

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
