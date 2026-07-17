# TO_IMPLEMENT — Full portal audit backlog (2026-07-11)

Findings from a manual walkthrough of all three portals (admin/principal, teacher,
student), organized as an actionable backlog. Design decisions and architecture for
the large cross-cutting items live in `IMPLEMENT.md` — this file is the checklist.
(The previous SRS-v1.0 checklist was fully complete and has been cleaned out per
the CLAUDE.md procedure.)

Legend: **[P1]** blocking/broken · **[P2]** major missing feature · **[P3]** UX/polish

---

## A. Cross-cutting (whole app)

- [x] **[P1] Complete Urdu i18n.** Every view now renders through i18next
      (en + ur); RTL flips with the language toggle. Remaining niceties:
      per-view namespace split + ESLint no-literal-string rule (IMPLEMENT §2).
- [x] **[P1] Names, not UUIDs.** Re-audited every screen and corrected checked
      but incomplete cases: form responses and locked-attendance rows now resolve
      student names; finance payments/donations return batched student/donor and
      category names; assignment submissions return student names. The UI uses
      localized unknown-value fallbacks instead of exposing identifier strings.
- [x] **[P2] Progressive Web App.** vite-plugin-pwa (autoUpdate SW, manifest,
      icons, network-first API read cache), mobile navbar drawer, dashboard
      quick-links grid, checkbox/touch sizing fixed.
- [x] **[P3] Checkbox size.** Global CSS fix in `app/src/styles.css` — checkboxes
      normalized to 1rem everywhere (Forms view especially).
- [x] **[P2] Personal settings.** `PATCH /auth/me`,
      `POST /auth/change-password`, and the shared `ProfileView.tsx` UI done.
- [x] **[P1] Super-admin tier.** `super_admin` role, `madrasa_features` flags,
      `/platform` onboarding + feature endpoints, router gating, nav filtering,
      and the SPA `PlatformView.tsx` console done.
- [x] **[P1] OWASP pass.** Full sweep done: **critical fix** —
      `get_current_madrasa` trusted the client-supplied `X-Madrasa` header
      independently of the authenticated user, letting any principal spoof
      another tenant's slug for cross-tenant access; now pinned to
      `current_user.madrasa_id` for non-super-admins. IDOR audit across every
      `/{id}` route in attendance/assessments/operations/finance/messaging/
      platform/reporting/academics/auth found and fixed 7 real gaps: finance
      salary record + payment history (zero tenant scoping), attendance
      summary-by-id (silent zeroed result instead of 404), academics
      `create_section` + `assign_course_to_class` (path `class_id` never
      tenant-checked), `students/enroll` (body `class_id`/`section_id` never
      tenant-checked), assessments `results/course` (weak `get_current_user`
      permission let any student query any other student's result).
      Regression tests for all of them in `test_authz_matrix.py`. Also:
      rate limiting confirmed on auth + public endpoints, password policy,
      per-role idle timeout now actually wired into JWT lifetime, file-upload
      content-type/size guardrails added, CORS `allow_credentials` flipped to
      `False` (bearer-token app, no cookies — was a real misconfiguration),
      security headers verified, public-form CSRF posture confirmed
      (honeypot + rate limit is the intended mitigation, unauthenticated by
      design), `pip-audit` run (starlette CVEs need a coordinated FastAPI
      major bump — flagged, not attempted here). The follow-up re-audit added
      PostgreSQL row-level security (including indirect tenant joins),
      transaction-local tenant context, tenant-prefixed object keys with exact
      signed upload sizes, cross-tenant download rejection, and draft-safe
      authenticated blog listings.
- [x] **[P1] Per-role/per-login session selection.** Now a server-side per-user
      preference (`users.selected_session_id`) + in-memory header; shared
      localStorage key removed.
- [x] **[P1] Non-active sessions read-only.** `require_active_session` /
      `ensure_writable_session` guards plus a central authenticated-write guard;
      the archived-session banner remains browseable while per-view mutation
      controls are hidden/disabled and the session switcher remains available.

## B. Admin portal

### B0. Delegation (mini-admins) — every admin screen
- [x] **[P2]** Per-screen "Assign to teachers…" control — `DelegateButton.tsx`
      (principal-only, class-scope picker) wired into every screen in
      `App.tsx`'s `VIEW_MODULES`; teacher portal renders delegated screens via
      `hasPermission` nav/route gating. Re-audit fixed scope editing so changing
      one module/scope preserves unrelated grants, non-scopable permissions are
      always madrasa-wide, and backend validation rejects cross-tenant targets.

### B2. Attendance
- [x] **[P2]** Admin override of *teacher* attendance —
      `/attendance/override` handles teacher subjects + check-in/out and the
      attendance board exposes the override control with a required reason.

### B3. Timetable
- [x] **[P3]** Weekly Grid tab first, List second. — verified already correct
      (stale checkbox): `TimetableView.tsx` defaults `viewMode` to `"grid"` and
      renders the Grid button before the List button.
- [x] **[P2]** Bulk upload of slots — backend `POST /operations/timetable/import`
      plus CSV paste/import UI (dry-run, per-row errors, conflicts).
- [x] **[P2]** List sorting + filters: by class, course, teacher, day —
      name-enriched/session-scoped backend and UI controls done.
- [x] **[P2]** Auto-derive periods + conflict detection (teacher/section
      overlap → 409) — backend done.
- [x] **[P2]** Timetable is now the source of truth for teacher assignments
      (`core/teaching_scope.py`, wired into assessments, attendance,
      dashboards); `ByTeacherView` groups “who teaches what where”, and the
      legacy Teacher Assignment tab is gone.

### B4. Holidays
- [x] **[P3]** Filters (date range, category, class) — backend and UI done.
- [x] **[P2]** Categories — backend done.
- [x] **[P2]** Class-scoped holidays — backend, attendance summary scope, and
      create/edit/filter UI done.

### B5. Leave
- [x] **[P3/P2]** `person_type` tabs, status/class/date filters, name search,
      and the complete tabbed UI done.

### B6. Announcements
- [x] **[P2]** Categories — free-text `category` field (same pattern as
      Assignment.category), filter dropdown + datalist autocomplete in
      `AnnouncementsView.tsx`.
- [x] **[P3]** Search — backend `q` parameter and UI done.
- [x] **[P2]** Three audience tabs + date filtering — backend and UI done.

### B7. Academics
- [x] **[P3]** (b) Classes: sort, filters, clearer UI — `AcademicsView.tsx`
      classes tab now has a search box, program filter, and name/program sort
      above the table.
- [x] **[P2]** (d) Merge Sections into the Classes tab — `AcademicsView.tsx`
      renders sections inline under their class row; no separate Sections tab.
- [x] **[P2]** (e) Course mapping stays class-level (`ClassCourse` — already
      class-scoped ✓) — dedicated layout shipped: the Classes tab now shows a
      course-count badge + "Manage courses" button per class row (instead of
      the old cramped inline course list), which opens a `CourseMappingModal`
      (two-column assigned/available picker, same `modalOverlay`/`modalCard`
      idiom as `DelegateButton.tsx`). Same `assignCourseToClass`/
      `unassignCourseFromClass` calls as before — presentation only.
- [x] **[P3]** (f) Course mapping: filters + sorting — search box + "filter by
      class" control above the sections/courses summary table; the dedicated
      layout from item (e) is now also shipped.
- [x] **[P1]** (g) Session switching leaks across roles/logins — fixed via
      per-user server-side preference (see A).
- [x] **[P2]** (h) Rollover per-module options: timetable + holidays (with
      date shift) done. Investigated announcements/resources/forms/grading/fee:
      none of those models carry a `session_id` in this schema (Resource, Form,
      Announcement, GradingScheme, ExamType, PaymentCategory are all tenant-wide,
      evergreen config/content — unlike TimetableSlot/Holiday/Enrollment/
      TeacherAssignment which are genuinely per-session) so they already show up
      in every session automatically; there is nothing to "copy" without adding
      session-tagging to those tables first, which would be a larger schema
      change than this backlog item implies. This is now the explicit product
      rule: evergreen rows remain shared and are not duplicated during rollover.
- [x] **[P1]** (i) Only active session actionable, others view-only — core
      guards + banner in (see A); per-route adoption continues with screens.
- [x] **[P2]** (j) Remove Teacher Assignment tab — no such tab exists;
      assignments derive from timetable slots via `core/teaching_scope.py`.
- [x] **[P2]** (k) Per-class portal-access config: classes whose students get no
      portal produce guardian logins instead — `AcademicClass.default_portal_enabled`
      now has a UI checkbox (create + edit) in `AcademicsView.tsx`, and
      `POST /academics/students/enroll` auto-disables the student's own portal
      login and auto-provisions a guardian login (reusing the existing
      `provision_login`/guardian `credentials-link` flow) whenever the target
      class has portal access switched off. Tested in
      `backend/tests/test_categories_scoping.py`.

### B8. Assessments
- [x] **[P2]** (a–c) Categories, sorting, edit/delete — full UI in
      `AssessmentsView.tsx` (932 lines: 3-tab Assignments/Grading/Results,
      class→section→course drill-down, filters, categories).
- [x] **[P1]** (d–e) Redesign Grading course-wise, with filters, categories,
      tabs — done in the same `AssessmentsView.tsx` rebuild; spreadsheet
      grading with column show/hide.
- [x] **[P2]** (f–h) Results: `/assessments/results/matrix` +
      `/assessments/results/export` (CSV/PDF with course→teacher footer),
      on-screen spreadsheet UI with column show/hide — all in
      `AssessmentsView.tsx`.
- [x] **[P2]** (i) Teacher assigned in timetable automatically gets assessments +
      attendance roster access (derived scope — done, tested). Admins can
      filter the organized assignment list by teacher and sort it server-side.
- [x] **[P2]** (j) Admin (and delegates) can publish an assignment to all classes —
      `all_classes: bool` flag on `POST /assessments/assignments` (gated on
      `assignments.manage_all`), resolves every class the course is mapped to
      via `ClassCourse` and creates one whole-class row per class sharing a
      `batch_id` (same batch machinery as multi-section publish, just at class
      granularity). `AssessmentsView.tsx` create form: "Publish to all classes"
      checkbox (visible only with the permission) hides the class/section
      pickers. 3 new backend tests in `test_assessments_redesign.py`.
- [x] **[P2]** Teacher teaching same course in multiple sections can publish one
      assignment to several sections at once (`section_ids[]` + `batch_id`,
      batch-wide edit/delete) — backend and shared teacher-portal UI done.
- [x] **[P2]** Teachers create assignments for own sections (slot-derived
      scope); admin overrides via `assignments.create_any`/`manage_all` —
      backend done.

### B9. Resources
- [x] **[P2]** Audience model for resources/forms/announcements (§6 resolver:
      all/roles/classes/sections/courses/users) — backend done; `AudiencePicker.tsx`
      now also exposes course-enrolment and specific-user targeting (previously
      only all/roles/classes/sections were wired into the UI).
- [x] **[P2]** Global + per-section resources; assignable by admin or teacher —
      `resources.manage` is now scoped: a teacher may only target classes/
      sections/courses they actually teach (derived from `teaching_scope`,
      same source of truth as assessments/attendance); targeting "everyone" /
      a whole role / specific users requires the new `resources.manage_all`
      override (or Principal). Enforced server-side in
      `_require_teachable_scope` (`operations/routes.py`).
- [x] **[P2]** Admin browses resources by class and section — `GET
      /operations/resources?class_id=&section_id=` (admin/`resources.manage_all`
      only) returns every resource whose scope actually covers that class/
      section, or is global; wired into `ResourcesView.tsx`'s toolbar.
- [x] **[P2]** Per-teacher categories; admin sees all categories + own global ones;
      admin can override any teacher's resources — `ResourceCategory.owner_id`
      (nullable = global) added; list/create endpoints respect ownership;
      `resources.manage_all` (or Principal) can edit/delete any resource or
      category. New Alembic migration `53c210d0f427`.
- [x] **[P2]** Audience targeting: group (teachers/students), section, course
      enrollment, class — covered by the `AudiencePicker.tsx` fix above.

### B10. Forms
- [x] **[P3]** Categories + organization; fix giant checkboxes — free-text
      `Form.category` (same pattern as B6/assessments), filter dropdown +
      datalist autocomplete in `FormsView.tsx`. ("Giant checkboxes" was
      already fixed globally per the A. Checkbox size entry.)
- [x] **[P2]** Audience assignment (group / all / sections / course-enrolled /
      classes) — covered by the `AudiencePicker.tsx` fix above.
- [x] **[P2]** Teachers with form permission can create/manage forms for their
      sections; admin overrides. Others respond-only. — same
      `_require_teachable_scope` enforcement as B9 (`forms.manage_all` is the
      admin override); `PUT`/`DELETE /operations/forms/{id}` added (didn't
      exist before) with `created_by_id` ownership checks.

### B11. People
- [x] **[P2]** Reorganize: categorized list w/ row actions, view-person modal,
      send-login-link — `PeopleView.tsx` (788 lines): Teachers/Students/
      Guardians/Donators tabs, detail modals.
- [x] **[P2]** "Add Teacher"/"Add Student" modals with full formal details
      (qualifications, CNIC, joining date, emergency contact, B-form, address).
- [x] **[P2]** Students categorized by class; enrollment handled from People.
- [x] **[P2]** Guardian details + logins — UI done in `PeopleView.tsx`.
- [x] **[P2]** Donators tab (see B13) — in `PeopleView.tsx`.
- [x] **[P2]** From a Teacher row: record salary; from a Student row: record
      fee — done in `PeopleView.tsx` detail panels.

### B12. Admissions
- [x] **[P2]** Split admissions into the requested workflow: “Students in
      person” opens the Admissions tab inside People, while “Public forms” is a
      separate navigation destination (with contact enquiries below it).
- [x] **[P2]** Public admission forms per program — admin CRUD, tokenized public
      form, submissions-to-registrations flow, and management UI done.
- [x] **[P2]** Contact form public-key endpoint — done
      (`POST /api/v1/public/contact/{public_key}`, honeypot + rate limit).

### B13. Finance
- [x] **[P2]** (a) Fees by class + category/date filters — backend done.
- [x] **[P2]** (b) Fee visible inside a selected student's record —
      `PeopleView.tsx` student detail panel.
- [x] **[P2]** (c) Donators auto-listed in People (new tab).
- [x] **[P3]** (d) Donation filters (donor/category/date) — backend done.
- [x] **[P2]** (e) Donator click-through → full donation history + add
      donation — `PeopleView.tsx`.
- [x] **[P2]** (f) Add fee/salary directly from People rows.

### B15. Reports
- [x] **[P2]** Report centre — `ReportsView.tsx` `ReportCard`-per-report
      layout covering attendance/finance/results-export/salary/donations.

### B16. Blog
- [x] **[P3]** Card/preview UI instead of a table — `BlogView.tsx` renders
      `.blogCard` articles.
- [x] **[P2]** Edit + delete — done.
- [x] **[P2]** Public read endpoint — done (`GET /api/v1/public/blog/{key}`).

### B17. Settings
- [x] **[P1]** Settings: typed catalogue + categorized `GET /settings/catalog`
      + validated writes — `SettingsView.tsx` renders it (category-grouped,
      `settings.manage`-gated).
- [x] **[P2]** Madrasa details + logo + per-role idle timeouts — catalogue
      keys render in `SettingsView.tsx`; logo fields now use an image picker,
      secured presigned upload, and persist the resulting tenant object key.
- [x] **[P2]** Feature-flag section is super-admin-only — `SettingsView.tsx`
      never renders flags at all (they only exist in the super-admin-only
      `PlatformView.tsx`), so the separation is structural, not a toggle.

## C. Teacher portal

- [x] **[P2]** Dashboard: direct "open class list" per taught section with course
      name; all student actions on that page. — `my_classes` was already returned
      by `/reporting/dashboard`; the buttons now actually deep-link via
      `lib/pendingNav.ts` (a one-shot signal consumed on mount) so clicking
      "open class list" / "Assessments" lands straight on that section's roster
      in `AttendanceBoard` / the pre-filtered Assignments tab, instead of just
      switching screens and making the teacher pick again.
- [x] **[P2]** Assessments page = admin's, scoped to taught sections (derived from
      timetable, IMPLEMENT.md §4). — backend already scoped (verified); dashboard
      deep-link now also pre-selects class/section/course on arrival.
- [x] **[P2]** Attendance page = admin's, scoped to taught sections, only if admin
      allows (permission-gated). — `/attendance/classes` already scoped to
      `taught_pairs`; verified, plus deep-link added.
- [x] **[P3]** Timetable: grid view only, own sections only. — already correct
      (`TimetableView.tsx` `isTeacher` branch); verified.
- [x] **[P3]** Holidays: own classes + global only. — this one was genuinely
      missing (not stale): `GET /operations/holidays` returned every holiday
      to every role regardless of `class_ids` scoping. Fixed server-side: for
      `UserRole.teacher`, resolves `taught_class_ids` (§4) and filters to
      global holidays ∪ holidays scoped to a class they teach. Regression test
      in `test_backend_sweep.py`. No frontend change needed — `HolidaysView.tsx`
      already just renders whatever the list endpoint returns.
- [x] **[P3]** Announcements: teacher-audience + global only. — verified
      already correct (stale checkbox): `list_announcements` already runs
      every row through `scope_allows(row.audience_scope, ctx)` via the §6
      resolver, and the frontend only sends the admin `audience` tab filter
      when `canPost` is true, so a plain teacher's request is unfiltered by
      tab and relies entirely on the (correct) server-side scope check.
- [x] **[P2]** Resources: upload for own sections if allowed; global resources
      visible; global upload if allowed; per-teacher permission toggles by admin.
      — verified already correct (stale checkbox): `DelegateButton` (wired
      into every screen via `App.tsx`'s `VIEW_MODULES`, incl. `resources`)
      already lets a principal grant/revoke `resources.manage` per teacher
      (whole-madrasa or class-scoped); `create_resource` gates on that exact
      permission, and `_require_teachable_scope` then restricts a granted
      teacher to classes/sections/courses they actually teach. No rebuild
      needed.
- [x] **[P3]** Forms: related only. — verified already correct (stale
      checkbox): `list_forms` filters through the same `scope_allows` +
      `visibility_scope` resolver as resources (admin/`forms.manage_all` ∪
      own-created ∪ scope match), so a teacher only sees forms targeting
      them/their sections/courses plus their own.
- [x] **[P2]** Profile settings (missing entirely). — new `ProfileView.tsx`
      (account info, preferred language, change password), reusing existing
      `PATCH /auth/me` + `POST /auth/change-password`; nav item added for
      teacher + student roles.
- [x] **[P2]** Salary view (own salary records/payments — read-only). — new
      `GET /api/v1/finance/salary/me` (minimal backend addition, tested in
      `backend/tests/test_self_service.py`); `SalaryView.tsx` now branches on
      `teachers.salary.manage` permission (admin lookup-any-teacher screen vs.
      read-only self-view).

## D. Student portal

- [x] **[P2]** Dashboard redesign: own attendance calendar, test scores, organized
      layout. — already implemented in a prior pass (`StudentDashboardCards` in
      `DashboardCards.tsx`: attendance calendar, latest published result +
      result-card download, due assignments with inline submit, announcements,
      resources, today's timetable, two-column layout); verified against the
      spec and left as-is.
- [x] **[P3]** Scope everything to self: own attendance, own timetable, related
      announcements/resources/forms only. — verified: `/reporting/dashboard`,
      `/assessments/results/me`, timetable and attendance endpoints are all
      filtered by the caller's own student/enrollment record server-side.
- [x] **[P1]** Remove from student nav: Admissions, Blog, Fee tracking (leaks
      admin views today — audit `navItems` role filtering in
      `app/src/data/mockData.ts` and enforce server-side too). — verified
      already correct: `admissions`/`finance`/`salary`/`reports`/`blog` nav
      items are all `roles: ["principal", "teacher"]`-gated, and the
      corresponding backend routes are permission-gated independently.
- [x] **[P2]** Personal settings page. — same `ProfileView.tsx` as the teacher
      portal (shared component, `profile` nav item for teacher + student).

## E. Additional findings (self-audit, "look for other things")

- [x] **[P2]** Route-level authorization audit — covered by the §A OWASP pass;
      `test_authz_matrix.py` now has the full IDOR + role-matrix regression
      coverage.
- [x] **[P3]** Empty/loading/error states standardized across views. — shared
      `LoadingState`/`ErrorState`/`EmptyState` components added
      (`app/src/components/ui/AsyncState.tsx`, reusing the existing
      `emptyState`/`notice` CSS classes). Rolled out to the 4 priority views
      in the first pass (`DashboardCards.tsx`, `AssessmentsView.tsx`,
      `PeopleView.tsx`'s 4 tabs), and now the remaining ~15 views identified
      as gaps: `AcademicsView.tsx` (top-level programs/classes/courses/
      sessions load), `TimetableView.tsx` (slots/classes/teachers load),
      `FinanceView.tsx` (categories + all 3 sub-tabs: contributions,
      donations, summary), `HolidaysView.tsx`, `LeaveView.tsx`,
      `ResourcesView.tsx`, `FormsView.tsx`, `SettingsView.tsx`,
      `PlatformView.tsx` (madaris list), `BlogView.tsx`, `ReportsView.tsx`
      (class/session filter load), `AdmissionsView.tsx` (all 3 tabs:
      registrations, admission forms, enquiries), `AnnouncementsView.tsx`,
      `SalaryView.tsx` (both the admin lookup-any-teacher view and the
      teacher self-view). Each follows the exact idiom already established
      in `PeopleView.tsx`/`AssessmentsView.tsx`: `isLoading`/(`loadError` or
      reused `error`) state around the fetch, `<LoadingState/>` while
      fetching, `<ErrorState message=.../>` on failure (i18n'd via
      `t("failedLoad...")`, new keys added in both `en`/`ur`), list content
      only rendered once loaded and error-free. `AttendanceBoard.tsx` and
      `RolloverWizard.tsx` already had a solid pattern (left as-is).
      `ProfileView.tsx` has no data-fetching of its own (reads from
      `AuthContext`, already loaded) — no real gap, left unchanged.
      `LeaveView.tsx`'s pre-existing file-wide hardcoded English gap was also
      completed: all copy, filters, statuses, empty states, and leave reasons
      now use English/Urdu i18n keys.
- [x] **[P3]** Date handling: Hijri support exists (`core/hijri.py`) — surface
      dual dates consistently in UI. `GET /academics/today` now accepts an
      optional `date` query param (was hardcoded to "today"), reusing the same
      `to_hijri_string()` conversion for any Gregorian date. New frontend
      `useHijri(date)` hook (`app/src/lib/hijri.ts`, in-memory cached per date
      — deterministic, so repeats across a session cost one request per unique
      date) + a shared `<HijriTag date=.../>` component
      (`app/src/components/HijriTag.tsx`). Wired into: Holidays list (start +
      end date), Attendance calendar (selected-day header, both class and
      student history tabs), Salary payments (admin + self-view), and Finance
      contributions/donations (same "Payment... dates" ask). (`hijri_converter`
      also migrated to `hijridate` earlier this session to clear the
      deprecation warning — CLAUDE.md mandate.)
- [x] **[P2]** Pagination — `limit`/`offset` query params + `X-Total-Count`
      header added across every GET endpoint whose response model is a list
      (auth, academics, assessments, attendance, finance, messaging,
      operations, people, platform, public and settings); response
      body shape unchanged. Shared frontend page helpers and accessible controls
      now consume those headers in the highest-growth management lists: teachers,
      students, guardians, assignments, registrations, public admission forms,
      and enquiries. Every remaining array-list client uses bounded automatic
      page traversal, so no view silently loses records beyond the first page.
      An introspection regression test prevents new list endpoints from omitting
      the pagination contract.
- [x] **[P3]** Toast/confirm patterns for destructive actions (delete assessment,
      delete slot…). — audited every `api.delete*`/`*Api.delete*` call site
      (8 files). Genuine gaps fixed: `TimetableView.tsx` slot delete had *no*
      confirmation at all and no error handling (fired the DELETE immediately
      on click) — now `window.confirm(t("deleteSlotConfirm"))` +
      inline error via the existing `onError` callback, matching the pattern
      used everywhere else. `AcademicsView.tsx`'s generic `handleDelete` and
      `AnnouncementsView.tsx`'s delete both had a confirm dialog already but
      with a hardcoded English string (and `AnnouncementsView` used `alert()`
      for the failure instead of the file's own inline-error pattern) —
      both now route through i18next (en+ur) and `AnnouncementsView` uses its
      existing `setError` state instead of `alert()`. AssessmentsView,
      FormsView, ResourcesView, BlogView, HolidaysView already had a correct
      i18n-backed `window.confirm()` — verified, left as-is.
