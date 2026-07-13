# IMPLEMENTED

Running log of completed work (newest first). Design rationale lives in
`IMPLEMENT.md`; the remaining backlog in `TO_IMPLEMENT.md`.

## 2026-07-13 — Course-mapping layout (B7-e) + loading/error rollout (§E)

### Leave view i18n follow-up
- Completed the deferred `LeaveView.tsx` localization pass: every heading,
  field, filter, status, reason, search label, error, and empty state now uses
  i18next with English and Urdu translations.

### Dedicated class↔course mapping layout (B7-e)
- `AcademicsView.tsx`'s Classes tab previously crammed the course list into
  a third inline column next to sections, cramped for classes with several
  courses. Replaced with: a course-count badge + "Manage courses" button per
  class row, opening a new `CourseMappingModal` — a two-column assigned/
  available course picker in a modal, same `modalOverlay`/`modalCard` idiom
  already used by `DelegateButton.tsx`. Same `assignCourseToClass`/
  `unassignCourseFromClass` API calls as before (including the existing
  delete-confirm dialog on unassign) — presentation-only change.
- New CSS: `.courseMapColumns`/`.courseMapList`/`.courseMapItem` in
  `app/src/styles.css`.
- New i18n keys (en+ur): `manageCoursesBtn`, `manageCoursesTitle`,
  `assignedCoursesLabel`, `availableCoursesLabel`, `noCoursesAssignedYet`,
  `noCoursesAvailableLabel`, `unassignBtn` (reused existing `assignBtn`/
  `deleteRecordConfirm`), `coursesCountLabel_one`/`_other`.
- While in the file, also wired `AcademicsView.tsx`'s top-level fetch
  (programs/classes/sections/courses/sessions/teachers) into the shared
  `LoadingState`/`ErrorState` pattern (was previously silent — no feedback
  on slow load or a failed fetch).

### Loading/error state rollout (§E), remaining ~15 views
Following the exact `isLoading`/`error`(or `loadError`) + `<LoadingState/>`/
`<ErrorState message=.../>` idiom already established in `PeopleView.tsx`/
`AssessmentsView.tsx` (from the first pass), rolled out to every remaining
view identified in TO_IMPLEMENT.md §E as missing it:
- **Priority-first**: `TimetableView.tsx` (slots/classes/teachers initial
  load — previously silently swallowed classes-fetch failures via
  `.catch(() => undefined)`), `FinanceView.tsx` (categories load +
  all 3 sub-tabs: contributions, donations, summary), `HolidaysView.tsx`,
  `LeaveView.tsx`, `ResourcesView.tsx`, `FormsView.tsx`.
- **Remainder**: `SettingsView.tsx`, `PlatformView.tsx` (madaris list, plus
  a new `noMadarisYet` empty state that didn't exist before),
  `BlogView.tsx`, `ReportsView.tsx` (class/session filter load —
  non-blocking banner since most report cards don't depend on it),
  `AdmissionsView.tsx` (all 3 tabs: registrations, admission forms,
  enquiries), `AnnouncementsView.tsx`, `SalaryView.tsx` (both the
  admin lookup-any-teacher view and the teacher read-only self-view).
- Every new user-facing string (loading/error/empty labels) added through
  i18next in both `en` and `ur` blocks of `app/src/i18n/index.ts`
  (`failedLoad*` keys per view, `noSettingsYet`, `noMadarisYet`).
- `ProfileView.tsx` has no data-fetching of its own (reads from
  `AuthContext`, already populated before render) — verified, no real gap,
  left unchanged per the "don't force a mechanical swap" guidance.
- **Found in passing, not fixed**: `LeaveView.tsx` has zero i18next
  integration anywhere in the file — every label, button, and status option
  is hardcoded English with no Urdu translation, unlike every sibling view.
  This violates the CLAUDE.md no-hardcoded-copy mandate but is a
  pre-existing, file-wide gap well beyond this task's scope; only the one
  new loading-error string (`failedLoadLeave`) was added through i18next
  since it's new code. Flagged as a separate follow-up task.
- Verified: `cd app && npx tsc --noEmit && npm run build` clean;
  `cd backend && .venv/bin/python -m pytest tests/ -q` still 106 passed
  (no backend touched this pass).

## 2026-07-13 — Timetable PDF export was clipped (bug report)

`GET /operations/timetable/export` (and the two other `render_table_pdf`
callers — reporting exports, assessments results export) overflowed the
page: a plain reportlab `Table` auto-sizes columns to fit unwrapped content,
so an 8-column grid (Time + 7 days) with multi-line "Course / Teacher" cell
text grew wider than portrait A4 and got clipped at the frame edge instead
of wrapping.

Fixed in `backend/app/core/pdf.py::render_table_pdf` (shared by all three
callers, no call-site changes needed):
- Every cell now renders as a `Paragraph` so long text wraps within its
  column instead of forcing the table wider than the page.
- Explicit `colWidths` always sum to the printable width (first column 16%,
  remaining columns split the rest evenly).
- Auto-switches to landscape A4 once a table has more than 5 columns
  (timetable's 8 columns always qualifies).
- Group/section-separator rows (both timetable and the results export
  already prefixed these `"— Class / Section —"`) now actually `SPAN`
  across the full row width with a shaded background, instead of rendering
  as a mostly-empty data row.

Confirms the existing behavior was already correct on the *data* side —
one weekly grid per section, stacked for every class in the madrasa (or
filtered to one via `class_id`) — the bug was purely rendering/layout.
Regression test in `test_backend_sweep.py` asserts the exported PDF's
`/MediaBox` is actually landscape. Suite: 106/106 green.

## 2026-07-13 — B8-j publish-to-all-classes, §C teacher-portal closeout, §E polish

Scope: `TO_IMPLEMENT.md` §B8(j), §C (Holidays/Announcements/Resources/Forms),
§B3, §E (loading/error states, Hijri dual-date, confirm patterns).

**B8-j — publish an assignment to all classes.** `AssignmentCreate` gains
`all_classes: bool` (`class_id` now optional, required unless `all_classes`;
`section_ids` rejected in combination — enforced by a pydantic
`model_validator`). `POST /assessments/assignments`: when `all_classes` is
set, requires `assignments.manage_all` (principal is an implicit superuser),
resolves every class the course is mapped to via `ClassCourse`, and creates
one whole-class row (`section_id=None`) per class sharing a `batch_id` — same
batch machinery as multi-section publish, just at class granularity instead
of section granularity. `AssessmentsView.tsx`'s create form gets a "Publish to
all classes" checkbox (visible only with the permission) that hides the
class/section pickers. 3 new backend tests (create/deny/reject-combo) in
`test_assessments_redesign.py`.

**§C teacher portal — Holidays, Announcements, Resources, Forms.** Of the 4
items, only **Holidays** was a genuine gap: `GET /operations/holidays`
returned every holiday to every role with no teacher scoping at all (the
`class_id` filter only applied when a caller explicitly passed one). Fixed:
for `UserRole.teacher`, the endpoint now resolves `taught_class_ids` (§4,
`core/teaching_scope.py`) and filters to global holidays ∪ holidays scoped to
a class they teach — even if a teacher explicitly queries another class's id,
they only get the global rows back. Regression test in `test_backend_sweep.py`.
The other three were already correct and just needed verification (stale
TO_IMPLEMENT.md checkboxes): **Announcements** (`list_announcements` already
runs every row through the §6 `scope_allows` resolver; the frontend only
sends the admin `audience` tab filter when `canPost`, so a plain teacher's
view is scope-filtered server-side with no tab restriction), **Forms**
(`list_forms` uses the identical `visibility_scope` + `scope_allows` pattern
as resources — admin/`forms.manage_all` ∪ own-created ∪ scope match), and
**Resources** (the existing `DelegateButton` — already wired into every
screen via `App.tsx`'s `VIEW_MODULES`, including `resources` — already lets a
principal grant/revoke `resources.manage` per teacher, whole-madrasa or
class-scoped; `create_resource` gates on that exact permission and
`_require_teachable_scope` restricts a granted teacher to classes/sections/
courses they actually teach). No rebuild needed for any of the three.

**B3 — verified already correct** (stale checkbox): `TimetableView.tsx`
already defaults to the grid view and renders the Grid button before List.

**§E — loading/error state standardization (partial).** New shared
`LoadingState`/`ErrorState`/`EmptyState` trio
(`app/src/components/ui/AsyncState.tsx`, built on the `emptyState`/`notice`
CSS classes already used ad hoc everywhere). Rolled out to the 4 prioritized
views: `DashboardCards.tsx` (previously `if (!data) return null` — a failed
fetch left the dashboard permanently blank with zero feedback),
`AssessmentsView.tsx`'s top-level load, and all 4 `PeopleView.tsx` tabs
(Teachers/Students/Guardians/Donators — none had a loading indicator or
caught a load failure before this). `AttendanceBoard.tsx` and
`RolloverWizard.tsx` already had a solid pattern, verified and left as-is.
~24 other views still have no loading/error handling — not touched this pass,
listed in `TO_IMPLEMENT.md` for the next one to pick up.

**§E — Hijri dual-date surfacing.** `GET /academics/today` now accepts an
optional `date` query param (previously hardcoded to "today"), reusing the
same `to_hijri_string()` conversion for any Gregorian date. New frontend
`useHijri(date)` hook (`app/src/lib/hijri.ts`, in-memory cached per date since
the conversion is deterministic) + a shared `<HijriTag date=.../>` component
(`app/src/components/HijriTag.tsx`). Wired into Holidays (start/end date),
Attendance calendar (selected-day header, class + student history), Salary
payments (both the admin lookup screen and the teacher self-view), and
Finance contributions/donations. 1 new backend test.

**§E — toast/confirm pattern standardization.** Audited every delete call
site (8 files). Real gap: `TimetableView.tsx`'s slot delete fired the DELETE
immediately with zero confirmation and zero error handling — now confirms via
`window.confirm(t("deleteSlotConfirm"))` and reports failures through the
existing `onError` callback. Two files had a confirm dialog but with a
hardcoded English string (CLAUDE.md "no hardcoded copy" mandate):
`AcademicsView.tsx`'s generic `handleDelete` and `AnnouncementsView.tsx`'s
delete (which also used `alert()` for the failure instead of the file's own
`setError` state) — both now route through i18next (en+ur). AssessmentsView,
FormsView, ResourcesView, BlogView, HolidaysView already had a correct
i18n-backed confirm — verified, left as-is.

**Tests:** 5 new backend tests (3 B8-j + 1 holidays teacher-scoping + 1 hijri
arbitrary-date). Backend suite: 106 passed (was 101). Frontend `tsc --noEmit`
and `npm run build` both clean.

## 2026-07-13 — B7-k portal/guardian provisioning, AudiencePicker fix, B6/B9/B10 categories & scoping

Scope: `TO_IMPLEMENT.md` §B6, §B7 (b/f/h/k), §B9, §B10.

**B7-k — per-class portal-access + guardian auto-provisioning.**
`AcademicClass.default_portal_enabled` (already existed) now has a UI
checkbox in `AcademicsView.tsx`'s class create/edit forms, plus a "Portal"
column on the classes table. `POST /academics/students/enroll`
(`backend/app/modules/academics/routes.py`) now checks the target class: if
`default_portal_enabled` is false, the student's own `User.portal_enabled`
and `StudentProfile.portal_enabled` are switched off, and every linked
Guardian without a login yet gets one auto-provisioned (reusing
`provision_login`, same flow the manual `guardians/{id}/credentials-link`
endpoint already used) with a generated unique username
(`generate_unique_username`, new in `auth/service.py` — slugifies the
guardian's name, retries with a numeric suffix on collision, since there's no
interactive username prompt at enrolment time). We deliberately never
re-enable a student's portal automatically on a later move to a
portal-enabled class — that flag could already be an explicit admin decision
for other reasons. `enroll_student` now returns `guardian_logins_provisioned:
[{guardian_id, username, set_password_url}]`. No new migration needed — every
column already existed. Tested in `backend/tests/test_categories_scoping.py`.

**AudiencePicker course/user targeting.** `app/src/components/AudiencePicker.tsx`
only exposed all/roles/classes/sections even though the backend `Scope` type
(`operations/audience.py`) already supported `courses` and `users`. Added
both modes: course targeting lists all courses; user targeting lists
teachers+students by name. Unblocks B9/B10 below.

**B6 — Announcement categories.** Free-text `category` column (same pattern
as `Assignment.category` — filterable, not a managed table), `category`
filter param on `GET /operations/announcements`, filter dropdown + datalist
autocomplete in `AnnouncementsView.tsx`.

**B9 — Resources.** `resources.manage` is now a *scoped* permission
(`core/permissions.py`): a teacher may create/manage resources for classes/
sections/courses they actually teach (derived from `core/teaching_scope.py`,
the same source of truth assessments/attendance already use), enforced by a
new `_require_teachable_scope` helper in `operations/routes.py`; targeting
"everyone", a whole role, or specific users needs the new
`resources.manage_all` override permission (or Principal). `ResourceCategory`
gained `owner_id` (nullable = global; set = private to that teacher) — a
teacher's own categories are invisible to other teachers, admins/
`resources.manage_all` see every category. `PUT`/`DELETE
/operations/resources/{id}` added (didn't exist before) with
`created_by_id` ownership checks, admin override. `GET /operations/resources`
gained `class_id`/`section_id` (admin browse-by-class/section — every
resource whose scope covers that class/section, or is global) and
`mine_only`. `ResourcesView.tsx` rebuilt: category privacy indicator, browse-
by-class/section toolbar (admin only), edit/delete on each row, "my uploads
only" toggle. Migration `53c210d0f427` (`resource_categories.owner_id`).

**B10 — Forms.** Same `_require_teachable_scope` enforcement as resources
(`forms.manage_all` is the admin override — `forms.create` stays the scoped
base ability, teachers are restricted to sections/classes/courses they
teach). Free-text `Form.category` (same pattern as B6). `PUT`/`DELETE
/operations/forms/{id}` added (didn't exist before) with `created_by_id`
ownership checks. `FormsView.tsx`: category filter + datalist, edit/delete on
each row gated by ownership. Migration `53c210d0f427` (`forms.category`).

**B7-b/f — Classes & course-mapping polish.** `AcademicsView.tsx` classes tab
gained a search box, program filter, and name/program sort; the course-
mapping (sections+courses per class) block gained a search box and
"filter by class" control. Not a full redesign (item B7-e explicitly still
wants a dedicated layout) — this is the "sort, filters, clearer" ask, done.

**B7-h — rollover copy options: investigated, not implemented.**
Announcements/Resources/Forms/GradingScheme/ExamType/PaymentCategory all
lack a `session_id` in this schema — unlike TimetableSlot/Holiday/
Enrollment/TeacherAssignment, which are genuinely per-session, these are
tenant-wide evergreen config/content and already show up in every session
automatically. There's nothing to "copy" without first adding session-
tagging to those tables, which is a materially bigger schema change than
this backlog line implies. Left undone rather than shipping wizard
checkboxes that would just duplicate rows with no way to tell old from new.

**Tests:** `backend/tests/test_categories_scoping.py` (7 new tests) — B7-k
enrolment provisioning (incl. no-op on re-enrolment), resource category
privacy, teacher-can-only-target-taught-sections (both resources and forms),
resource/form ownership on update/delete, announcement category filter.
Backend suite: 101 passed (was 94). Frontend `tsc --noEmit` and `npm run
build` both clean.

## 2026-07-13 — Backend hardening: OWASP pass, pagination, hijri migration (TO_IMPLEMENT.md §A/§E)

Full sweep across the backend, plus the last real UUID leak in the frontend.

**Critical fix:** `get_current_madrasa` (`backend/app/core/dependencies.py`)
trusted the client-supplied `X-Madrasa` header independently of the
authenticated user — any principal could spoof another tenant's slug and get
full cross-tenant read/write access, since role-based permission checks
(principal = implicit superuser for its own permission codes) carry no tenant
scope of their own. Now pinned to `current_user.madrasa_id` for
non-super-admins. Regression: `test_x_madrasa_header_cannot_spoof_tenant`.

**IDOR audit** — every `/{id}` route in attendance, assessments, operations,
finance, messaging, platform, reporting, academics, and auth was read in full
(via parallel sub-agents, findings consolidated and applied here). 7 real gaps
found and fixed, all with regression tests in `backend/tests/test_authz_matrix.py`:
- `finance/routes.py` `GET /salary/{teacher_id}` + `GET /salary/{teacher_id}/payments`
  — zero tenant scoping at all (missing the `madrasa` dependency entirely).
- `attendance/routes.py` `GET /summary/{subject_type}/{subject_id}` — silently
  returned a zeroed-out summary for a bad/cross-tenant `subject_id` instead of
  404.
- `academics/routes.py` `POST /classes/{class_id}/sections` and
  `POST /classes/{class_id}/courses/assign` — path `class_id` never
  tenant-checked before writing the child row, letting a principal attach a
  section or course-assignment to another madrasa's class.
- `academics/routes.py` `POST /students/enroll` — body `class_id`/`section_id`/
  `program_id` never tenant-checked before writing the `Enrollment` row.
- `assessments/routes.py` `GET /results/course` — only required an
  authenticated user (any role), letting a student query any other student's
  per-course result by guessing ids; now requires `assessments.marks.enter`
  like its sibling result endpoints, plus an explicit student-tenant check.

Everything else across all 9 route modules audited clean (SQL-scoped list
endpoints, correctly-ordered tenant checks on mutations).

**Pagination:** `limit`/`offset` query params + `X-Total-Count` response
header added to every list endpoint across academics, assessments,
attendance, finance, messaging, operations, people, platform
(`backend/app/core/pagination.py`). Response body shape unchanged — frontend
doesn't consume the new params yet, flagged in TO_IMPLEMENT.md §E.

**Other OWASP items:** rate limiting confirmed applied to auth + public
endpoints; password policy; per-role idle-timeout settings now actually wired
into JWT lifetime at login (previously stored but unused); file-upload
content-type allowlist + size cap + path-safe object keys added to
`core/storage.py`; CORS `allow_credentials` flipped to `False` (bearer-token
app, no cookies — wildcard-origin-regex + credentials was a real OWASP
misconfiguration); security headers verified already in place; public-form
CSRF posture confirmed intentional (honeypot + rate limit, unauthenticated by
design); `pip-audit` run — starlette CVEs need a coordinated FastAPI major
version bump, flagged but not attempted.

**Package fixes (CLAUDE.md mandate — fix deprecations on the go):**
`hijri_converter` → `hijridate` migration (`backend/app/core/hijri.py`),
clears the deprecation warning. `python-jose` 3.3.0 → 3.5.0 (clears 3 CVEs).

**Frontend UUID leak:** `FormsView.tsx` response table rendered raw
`student_id`; `FormResponseRead` now joins `student_name` server-side
(`backend/app/modules/operations/routes.py` `list_form_responses`).

Suite: 94 backend tests green (89 + 5 new regression tests); frontend
`tsc --noEmit` clean.

## 2026-07-12 — Teacher & student portal closeout (TO_IMPLEMENT.md §C/§D)

Most of §C/§D turned out to already be backend-correct or frontend-built from
prior passes (teacher dashboard `my_classes`, student attendance
calendar/scores/timetable/announcements/resources, role-based nav filtering,
timetable teacher scoping). This pass closed the remaining genuine gaps:

- **Deep-linked "open class list"**: `app/src/lib/pendingNav.ts` — a one-shot
  signal the teacher dashboard sets before navigating, consumed on mount by
  `AttendanceBoard` (auto-selects the class/roster) and `AssessmentsView`'s
  Assignments tab (pre-fills class/section/course filters). Previously the
  buttons just switched screens and made the teacher pick the class again.
- **Personal settings page (missing entirely for teacher + student)**: new
  `app/src/components/ProfileView.tsx` — username/role display, preferred
  language (via existing `PATCH /auth/me`, now also exposed through a new
  `updateProfile()` on `AuthContext`), and change password (existing
  `POST /auth/change-password`, new `authApi.changePassword`). New `profile`
  nav item, `roles: ["teacher", "student"]`, in a new `groupAccount` nav
  group. No new backend needed here — both endpoints already existed.
- **Teacher salary self-view**: `SalaryView.tsx` now branches on
  `hasPermission("teachers.salary.manage")` — admins/delegates keep the
  existing lookup-any-teacher screen (`AdminSalaryView`); every other teacher
  gets a new read-only `MySalaryView` (own record + payment history only).
  Required one minimal backend addition: `GET /api/v1/finance/salary/me`
  (`backend/app/modules/finance/routes.py`, registered *before*
  `GET /salary/{teacher_id}` to avoid "me" being swallowed as a UUID path
  param), `MySalaryRead` schema, 403 for non-teacher accounts. The `salary`
  nav item's `permission` gate was removed (kept `roles` + `feature`) so every
  teacher sees it. 4 new tests in `backend/tests/test_self_service.py`.
- **Verification pass** (no code changes, confirmed already correct): teacher
  timetable grid-only/own-sections (`TimetableView.tsx` `isTeacher`),
  attendance/assessments backend scoping via `core/teaching_scope.py`
  (`taught_pairs`), student self-scoping on dashboard/results/timetable, and
  student nav exclusion of Admissions/Finance/Salary/Reports/Blog (all
  already `roles: ["principal", "teacher"]`-gated in `mockData.ts`).

Left undone (out of this pass's file-ownership scope — `AnnouncementsView`,
`ResourcesView`, `FormsView`, `AudiencePicker`, `AcademicsView` explicitly
excluded): teacher-scoped Holidays/Announcements/Resources/Forms filtering
(§C rows still unchecked in TO_IMPLEMENT.md).

Suite: 87 backend tests green (83 + 4 new); frontend `tsc --noEmit` and
`vite build` both clean.

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
