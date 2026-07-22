# IMPLEMENT — Design & architecture for the portal-audit backlog

Companion to `TO_IMPLEMENT.md` (the checklist). This file records *how* the large
cross-cutting items will be built: data-model changes, API surface, and the order
of work. Everything stays data-driven (no hardcoded business copy), tenant-isolated
via application scoping + PostgreSQL RLS, and deployable on Coolify via the
existing Dockerfiles — per the standing rules in `CLAUDE.md`.

Current stack recap: FastAPI modular monolith (`backend/app/modules/{academics,
assessments, attendance, auth, files, finance, messaging, operations, people,
reporting}`), SQLAlchemy + Alembic, React/Vite SPA in `app/` (portal) and `web/`
(marketing site), i18next, existing `UserPermission` + `PermissionRegistry`
permission system, roles `principal | teacher | student`.

## 2026-07-22 live qualification decisions

- Live-role verification is a disposable release fixture, not a production
  seeder. It requires an explicit confirmation token plus API, tenant, and
  principal settings; generated role credentials are stored only in an ignored,
  mode-0600 state file and the isolated services are removed after qualification.
- A visible requirement is exercised through the browser whenever the user
  action is material. Direct API seeding only establishes prerequisites; the
  browser performs and asserts student/guardian creation, form submission,
  resource upload, mutation loading, and result/submission downloads.
- Release role coverage is a five-role × two-language × two-viewport smoke
  matrix, followed by focused role journeys and named screenshots. Any HTTP
  response at or above 400 fails the browser run.
- PostgreSQL reset-based tests require both a clearly test-named database and an
  explicit reset opt-in. RLS is tested separately through a temporary non-owner
  login because PostgreSQL table owners bypass row-level security.

## 2026-07-22 approved issue-resolution architecture

The current implementation follows the domain definitions in `CONTEXT.md` and
the three binding decisions in ADR-001 through ADR-003:

- Attendance identity is student + session + date + timetable period. New
  student marks require a paired course/slot; nullable legacy records remain
  readable as explicitly labelled general attendance. Offline idempotency uses
  the same period identity.
- Application acceptance is one row-locked, idempotent conversion transaction.
  It provisions Student and Guardian accounts/profiles, their link, enrollment,
  immutable admission snapshot, conversion link, and durable administrator
  notification. Reversing the application status preserves those People rows.
- Grading configuration is an atomic course default or class override aggregate:
  weighted components total 100%, assignments form one optional pool, and grade
  bands must be complete and non-overlapping.

Shared presentation contracts are equally explicit: `InlineFilter` is the sole
filter toolbar; `Modal` owns rounded clipping with an independently scrolling
body; form stack/grid classes own spacing; PDF endpoints derive language from
the authenticated user. `TO_IMPLEMENT.md` is the requirement/evidence matrix,
while only evidence-backed completions may be copied to `IMPLEMENTED.md`.

Implementation outcome: `CURRENT-01..20` now satisfy their API/browser/render
evidence rows and are recorded in `IMPLEMENTED.md`. The older `PDF-*` set is
tracked independently because several of its strict live-role and deployment
qualification gates cannot be replaced by mocked UI journeys or SQLite tests.
This distinction is intentional: implemented behavior and release-environment
proof are separate V-Model checkpoints.

---

## §1 Super-admin tier & per-madrasa feature flags

**Problem.** No platform-level operator. Madrasas cannot be onboarded with a
tailored feature set, and nothing sits above the principal.

**Design.**

- New role value `super_admin` in `UserRole`. Super-admin users have
  `madrasa_id = NULL` (platform scope) — relax the FK to nullable and make every
  tenant-scoping dependency treat a null-tenant super admin as "explicit madrasa
  required via `X-Madrasa-Id` header or path param", never "all rows implicitly".
  RLS policy: super-admin DB role bypasses tenant policy only through dedicated
  platform endpoints, not by reusing madrasa endpoints.
- New table `madrasa_features` (`madrasa_id`, `feature_key`, `enabled`,
  `set_by_id`, timestamps; unique on madrasa+key). Feature keys form a typed
  catalogue mirroring the sidebar modules: `attendance`, `timetable`, `holidays`,
  `leave`, `announcements`, `academics`, `assessments`, `resources`, `forms`,
  `people`, `admissions`, `finance`, `salary`, `reports`, `blog`, `messaging`.
- Enforcement is layered:
  1. **Backend hard gate** — a `require_feature("finance")` dependency on every
     module router; 403 when disabled. This is the authority.
  2. **Frontend** — `GET /auth/bootstrap` returns enabled features; `navItems`
     filter on it. UI hiding is convenience only.
- **Override rule (explicit):** principals may override any *setting* (§7) but
  feature flags live in a separate table with no principal-writable endpoint —
  structurally impossible to override, not just policy.
- Platform endpoints (`/platform/...`, super-admin only): madrasa CRUD +
  onboarding wizard (create madrasa → seed defaults via `bootstrap.py` path →
  provision first principal → set feature flags), feature toggle, madrasa list
  with usage stats.
- Super-admin UI: either a fourth portal mode in `app/` (simplest; reuse auth) or
  a separate route tree `/platform`. Decision: same SPA, separate route tree —
  shares components, deploys as one artifact.

## §2 i18n completion + RTL

- Move from the single 482-line `app/src/i18n/index.ts` to per-namespace JSON
  bundles (`app/src/i18n/{en,ur}/{common,attendance,finance,...}.json`) loaded
  with i18next namespaces. Mechanical migration per view: extract every literal
  into the view's namespace, verify with an ESLint rule
  (`eslint-plugin-i18next/no-literal-string`) so regressions fail CI.
- RTL: `dir="rtl"` on `<html>` when language is `ur`; use CSS logical properties
  (`margin-inline-start` etc.) in `styles.css`; audit flex layouts.
- Locale-aware dates/numbers via `Intl` with the active language; Hijri rendering
  helper backed by `core/hijri.py` values coming from the API.
- User's `preferred_language` (already on `User`) becomes the initial language
  after login; toggle persists back via `PATCH /auth/me`.
- Definition of done: `grep`-audit shows zero user-visible literals outside
  bundles; every view renders correctly in ur/RTL.

## §3 Delegation — mini-admins

**Problem.** Admin must be able to hand a teacher a screen, or just specific
features of a screen.

**Design.** The `UserPermission` + `PermissionRegistry` machinery already models
exactly this — extend, don't replace.

- Grow the permission catalogue so every admin-screen *feature* (not just screen)
  has a code, following the existing `module.feature.verb` convention, e.g.
  `holidays.manage`, `holidays.view`, `announcements.post`, `finance.fees.record`,
  `people.students.add`, `timetable.slots.manage`, … Screen access = union of its
  feature codes.
- Scoped grants: `UserPermission` gains optional `scope_type`/`scope_id`
  (nullable; e.g. `class`/`section`) so a grant can be "assessments for section X
  only". Registry already carries a `scoped` bit per permission.
- API: `GET/PUT /auth/users/{id}/permissions` (grant/revoke sets, principal-only),
  `GET /auth/permissions/catalog` for the UI.
- UI: every admin screen header gets a "Delegate…" button (principal only) opening
  a modal listing that screen's feature codes with teacher multi-select and
  optional scope. Data-driven from the catalog — no per-screen hardcoding.
- Teacher portal: sidebar and screens render from *effective permissions*
  (role defaults ∪ grants), returned by `/auth/bootstrap`. Backend routes already
  check permission codes; verify each route requires the exact feature code, not
  just role.

## §4 Timetable as source of truth for teacher assignment

**Problem.** `TeacherAssignment` is managed on a separate Academics tab, duplicating
what timetable slots already express; assessments/attendance access doesn't follow.

**Design.**

- `TimetableSlot` (already has section/course/teacher) becomes authoritative.
  Drop the Teacher Assignment tab; keep the `TeacherAssignment` table as a
  *derived* projection maintained by slot create/update/delete (or replace reads
  with a `DISTINCT section_id, course_id, teacher_id FROM timetable_slots` view —
  decision: DB view `v_teacher_assignments`, no sync code to break).
- Derived access rule, used everywhere teacher scope matters (assessments,
  attendance roster, resources, class lists): *teacher T may act on (section S,
  course C) iff a slot (S, C, T) exists in the active session* — plus any explicit
  §3 grant.
- Timetable UI: grid first; each slot chip shows course + teacher + section names
  (never IDs); a "by teacher" grouped list view answers "who teaches what where";
  conflict detection (same teacher or same section overlapping times) computed
  server-side on save; period numbers auto-derived from ordered distinct start
  times per section instead of manual entry.
- Bulk upload: `POST /operations/timetable/import` accepting CSV/XLSX
  (section, course, teacher, day, start, end), dry-run mode returning
  per-row errors + conflicts before commit.
- Rollover: slots copy per §10 wizard options.

## §5 Assessments & results redesign

- **Grading, course-wise.** Grading screen pivots on (class → course → exam type):
  pick class+course, see sections as tabs, students as rows, marks inline-editable.
  Categories on `Assignment` (new `category` field) + full CRUD (edit/delete were
  missing).
- **Results = spreadsheet + report.**
  - `GET /assessments/results?section_id=` / `?class_id=` returns a matrix:
    students × courses (with exam-type breakdown), each course annotated with its
    teacher (from §4 view).
  - UI: on-screen sheet with column show/hide, sticky headers; class view
    aggregates sections.
  - Export: XLSX + PDF via existing `core/pdf.py` pipeline; report layout ends
    each section with the summary block "Course — Teacher" the user asked for.
- **Access derivation.** Teacher sees/creates assessments only for §4-derived
  (section, course) pairs. Admin sees all, grouped by teacher, sortable/filterable.
- **Multi-section publish.** Assignment create accepts `section_ids[]` when the
  same (teacher, course) pair exists in each (one logical assignment, one row per
  section sharing a `batch_id` so later edits can fan out or detach).
- **Admin-wide assignments.** With `assignments.create_any`, target: all classes,
  selected classes, selected sections, or course-enrolled students — this reuses
  the audience model of §6.

## §6 Unified audience targeting (announcements, resources, forms, assignments)

Four modules need the same "who sees this" mechanics; build it once.

- New table `audiences` (`id`, `owner_type`+`owner_id` — announcement/resource/
  form/assignment, `madrasa_id`) with child `audience_rules`
  (`audience_id`, `rule_type`, `ref_id`): rule types `all`, `role:teacher`,
  `role:student`, `class`, `section`, `course_enrolled`, `user`.
- One resolver service (`modules/operations/audience.py`):
  `visible_to(user) -> SQL filter` and `resolve_members(audience) -> user ids`.
  Student visibility = own enrollment (class/section/courses); teacher visibility
  = §4 taught scope + role rules + global.
- Each module keeps its own list UI but shares the audience-picker component
  (group / classes / sections / courses / individuals) and the same tab pattern
  the user asked for on Announcements (Teachers / Students / All + search + date
  filter).
- Ownership & override: rows carry `created_by`. Teachers manage their own within
  their §4 scope; admin (or §3 delegate) can edit/delete/re-target anything.
  Per-teacher category lists on resources: `ResourceCategory.owner_id` nullable —
  null = admin/global category.

## §7 Settings redesign

- Storage stays `MadrasaSetting` (key/value, tenant-scoped) but a typed catalogue
  (`core/settings_catalog.py`) defines every setting: key, category, type
  (bool/int/enum/string/file), default, label i18n key, `editable_by`
  (principal/super_admin). Unknown keys are rejected — kills the raw
  key/value editor.
- Categories: **Madrasa profile** (name, address, phones, email, logo file id —
  visible read-only to all members via bootstrap payload), **Security** (idle
  timeout per role, password policy), **Academics** (per-class portal access
  default → §B7-k, Hijri display), **Attendance** (lock time), **Finance**
  (currency, receipt footer), **Messaging**, **Portal** (default language, theme).
- API: `GET /operations/settings` (typed, categorized), `PUT` per key with type
  validation. Logo upload through existing `files` module + `core/storage.py`.
- Idle timeout: frontend timer from bootstrap value → auto-logout; backend token
  TTL respects the same setting.
- Feature flags (§1) deliberately **not** here — separate table, separate
  super-admin-only endpoints.

## §8 PWA & mobile

- `vite-plugin-pwa` in `app/vite.config.ts`: manifest (name/icons from madrasa
  settings where possible — icons need static fallbacks), `registerType:
  autoUpdate`, Workbox runtime caching: cache-first for static assets, network-
  first with cache fallback for GET API reads. Writes stay online-only except
  attendance, which already has an outbox (`useAttendanceOutbox.ts`,
  `offlineDb.ts`) — keep that path untouched.
- Mobile layout: sidebar collapses to a hamburger drawer under `md:` breakpoint;
  dashboard gains a quick-links grid (role-aware); tables get horizontal-scroll
  containers; form controls sized for touch (also fixes the oversized-checkbox
  complaint — normalize checkbox/radio to 1rem–1.25rem in `styles.css`).
- Install prompt UX + iOS meta tags.

## §9 OWASP pass (checklist to execute, not just read)

1. **Broken access control (A01)** — biggest live risk: student portal currently
   shows admin views (admissions, blog, fee). Test every route × role in
   `backend/tests/test_authz_matrix.py` (parametrized: expect 403). Verify RLS
   active on all tenant tables (`alembic` migration audit) + application scoping
   in every query. IDOR sweep on all `/{id}` routes: fetched row's `madrasa_id`
   must match tenant.
2. **Crypto (A02)** — bcrypt/argon2 confirmed in `core/security.py`; token expiry;
   HTTPS assumptions documented for Coolify.
3. **Injection (A03)** — ORM everywhere; grep for f-string SQL; validate
   CSV import fields (§4 bulk upload) and form-builder field definitions.
4. **Insecure design (A04)** — public endpoints (admission forms, contact form,
   blog) rate-limited via `core/rate_limit.py` + captcha/honeypot on public
   POSTs; public-key model for the contact form (per-madrasa random key, not
   guessable madrasa id).
5. **Misconfiguration (A05)** — CORS allowlist (recent 500-CORS fix already in),
   security headers middleware (CSP, X-Frame-Options, HSTS), FastAPI docs off in
   prod, error responses never leak stack traces.
6. **Vulnerable deps (A06)** — `pip-audit` + `pnpm audit` in CI; fix deprecations
   on sight (CLAUDE.md rule).
7. **Auth failures (A07)** — login rate limit + lockout backoff; password policy
   from §7 settings; idle logout; single-use, expiring set-password links
   (`SetPasswordPage` flow); session invalidation on password change.
8. **Integrity (A08)** — file upload: extension+MIME allowlist, size caps,
   randomized storage names, never serve from executable paths.
9. **Logging (A09)** — `record_audit` coverage for every privileged mutation
   (grants §3, feature flags §1, overrides, finance writes); no secrets in logs.
10. **SSRF (A10)** — no user-supplied URL fetches today; keep it that way in
    resource links (store, don't fetch).

## §10 Sessions: per-user selection, read-only past, richer rollover

- **Selection**: replace shared `mms_session_id` localStorage key with per-user
  server preference (`users.selected_session_id`, set via `PATCH /auth/me`);
  bootstrap returns it. Different logins/roles on one browser stop clobbering
  each other.
- **Read-only enforcement**: backend dependency `require_active_session` on every
  mutating route that takes session-scoped data — writes only when the target
  session `is_active`. Frontend puts a "viewing archived session" banner and
  disables mutating controls.
- **Rollover wizard**: extend `RolloverWizard.tsx` + rollover service with
  per-module choices (copy / start fresh): enrollments (exists), teacher
  assignments via timetable copy, timetable slots, holidays, announcements,
  resources, forms, grading schemes/exam types, fee structures. Each module =
  one checkbox + optional options (e.g. "shift holiday dates by a year").
  Server executes in one transaction, returns per-module counts.

## §11 People / Admissions / Finance reorganization

- **People** becomes the person hub: tabs Teachers / Students (grouped by class) /
  Guardians / **Donators**. Row = name + username + actions (view modal, send
  login link). Add-Teacher / Add-Student modals capture full formal records
  (extend `TeacherProfile`/`StudentProfile`: CNIC, qualifications, joining date,
  emergency contact, address, photo …) — new Alembic migrations. Student modal
  handles class/section selection + course enrollment in one flow. Guardian
  section per student; guardian gets the login link when the student's class has
  portal access off (§B7-k).
- **Cross-links**: teacher row → salary history + "record payment"; student row →
  fee history + "record fee"; donator row → donation history + "add donation".
  These reuse finance endpoints with a person filter — no duplicate logic.
- **Admissions** splits: "Students in Person" = the People add-student flow;
  "Forms" = public admission forms per program (tokenized public URL, no auth,
  rate-limited, submissions → Registrations tab → one-click convert to student).
  Contact form: per-madrasa public key, `POST /public/contact/{key}`, W3Forms-
  style, for the `web/` marketing site; blog gains `GET /public/blog/{madrasa}`
  read endpoints likewise.
- **Reports centre**: one screen, data-driven list of report definitions
  (scope pickers: session/class/section/course/person; kind: attendance, results,
  fees, donations, salary; format: CSV/PDF) — extends the existing
  `/reporting/reports/*` pattern instead of ad-hoc pages.

## Build order (dependency-driven)

1. **Foundations**: §10 session scoping + read-only; §3 permission catalogue
   growth; §1 super admin + feature flags; OWASP authz matrix tests (§9.1) —
   everything else hangs off these.
2. **Scope engine**: §4 timetable-derived assignment + `v_teacher_assignments`;
   §6 audience model. Unblocks teacher portal, assessments, resources, forms,
   announcements.
3. **Screens**: §5 assessments/results; §11 People/Admissions/Finance; §7
   settings; per-screen filter/sort/tab items from TO_IMPLEMENT B3–B6, B16.
4. **Experience**: §2 i18n+RTL sweep (last so new screens land translated once);
   §8 PWA + mobile; student/teacher dashboard redesigns; §9 remaining OWASP
   items + dependency audits.

Each step: plan → Alembic migration → backend + tests (`backend/tests/`) →
frontend → update this file and tick `TO_IMPLEMENT.md`. Document completed work
in `IMPLEMENTED.md` per CLAUDE.md.
