# TO_IMPLEMENT — Full portal audit backlog (2026-07-11)

Findings from a manual walkthrough of all three portals (admin/principal, teacher,
student), organized as an actionable backlog. Design decisions and architecture for
the large cross-cutting items live in `IMPLEMENT.md` — this file is the checklist.
(The previous SRS-v1.0 checklist was fully complete and has been cleaned out per
the CLAUDE.md procedure.)

Legend: **[P1]** blocking/broken · **[P2]** major missing feature · **[P3]** UX/polish

---

## A. Cross-cutting (whole app)

- [ ] **[P1] Complete Urdu i18n.** Language toggle exists but most views have zero
      `t()` calls (`AdmissionsView`, `BlogView`, `FinanceView`, `HolidaysView`,
      `ReportsView`, `ResourcesView`, `RolloverWizard`, and more are 100% hardcoded
      English). Every non-user-entered string — buttons, labels, headers, empty
      states, toasts, validation messages — must go through `app/src/i18n/index.ts`
      (or split per-view bundles; see IMPLEMENT.md §2). Include RTL layout support
      for Urdu.
- [ ] **[P1] Names, not UUIDs.** Several screens render raw IDs (timetable slots,
      course mapping, marks, etc.). Backend list endpoints must join/embed display
      names; frontend must never show a UUID.
- [ ] **[P2] Progressive Web App.** Add `vite-plugin-pwa` (manifest, service worker,
      install prompt, offline shell — attendance outbox already exists in
      `useAttendanceOutbox.ts`, extend caching to read views). Proper mobile styles:
      navbar drawer instead of fixed sidebar, quick-links/action grid on dashboard,
      touch-friendly hit targets.
- [ ] **[P3] Checkbox size.** Global CSS fix in `app/src/styles.css` — checkboxes
      render oversized everywhere (Forms view especially).
- [ ] **[P2] Personal settings page (all roles).** Change password, phone, preferred
      language, profile photo. Backend: `PATCH /auth/me`, `POST /auth/change-password`.
- [x] **[P1] Super-admin tier (backend).** `super_admin` role, `madrasa_features`
      flags, `/platform` onboarding + feature endpoints, router gating, nav
      filtering. Remaining: super-admin UI (route tree in the SPA).
- [ ] **[P1] OWASP pass.** Systematic review: tenant isolation on every route
      (RLS + application scoping per CLAUDE.md mandate), IDOR checks on all
      `/{id}` endpoints, rate limiting coverage (`core/rate_limit.py` exists —
      verify applied to auth + public endpoints), password policy, session/token
      expiry + idle logout, file-upload validation (`core/storage.py`), audit-log
      coverage, security headers, CSRF posture for the public form endpoints,
      dependency audit. See IMPLEMENT.md §9.
- [x] **[P1] Per-role/per-login session selection.** Now a server-side per-user
      preference (`users.selected_session_id`) + in-memory header; shared
      localStorage key removed.
- [x] **[P1] Non-active sessions read-only (core).** `require_active_session` /
      `ensure_writable_session` guards + archived-session banner. Remaining:
      apply the guard to every mutating route as screens are reworked, and
      disable mutating controls per-view.

## B. Admin portal

### B0. Delegation (mini-admins) — every admin screen
- [ ] **[P2]** Per-screen "Assign to teachers…" control that grants not the whole
      screen but selected features of it. See IMPLEMENT.md §3.
      **Backend done:** feature codes (`holidays.manage`, `leave.manage`,
      `admissions.manage`, `settings.manage`), scoped grants
      (`scope_type`/`scope_id`), scoped checks, grant/list API.
      **Remaining:** "Delegate…" modal UI per screen; teacher portal renders
      delegated screens from effective permissions.

### B2. Attendance
- [ ] **[P2]** Admin override of *teacher* attendance (mark/correct teacher
      check-in/out from admin screen; `attendance.edit_locked` flow exists for
      students — extend to teachers).

### B3. Timetable
- [ ] **[P3]** Weekly Grid tab first, List second.
- [ ] **[P2]** Bulk upload of slots (CSV/XLSX import + grid multi-create).
- [x] **[P2]** List sorting + filters: by class, course, teacher, day —
      backend done (name-enriched, session-scoped); UI hookup pending.
- [x] **[P2]** Auto-derive periods + conflict detection (teacher/section
      overlap → 409) — backend done.
- [x] **[P2]** Timetable is now the source of truth for teacher assignments
      (backend: `core/teaching_scope.py`, wired into assessments, attendance,
      dashboards). Remaining: UI grouping "who teaches what where" and
      removing the Teacher Assignment tab (B7-j).

### B4. Holidays
- [ ] **[P3]** Filters (date range, category, scope).
- [ ] **[P2]** Categories (religious, national, madrasa-specific, exam break…).
- [ ] **[P2]** Class-scoped holidays: a holiday can apply to specific classes only.
      Attendance/timetable logic must respect scope.

### B5. Leave
- [ ] **[P3]** Filters everywhere.
- [ ] **[P2]** Separate Teachers / Students tabs.
- [ ] **[P2]** Student tab: class filter + every applicable filter (status, type,
      date range, section).
- [ ] **[P3]** Per-tab search.

### B6. Announcements
- [ ] **[P2]** Categories.
- [x] **[P3]** Search — backend `q` param done; UI pending.
- [x] **[P2]** Three audience tabs + date filtering — backend
      (`audience=teachers|students|all`, `date_from`/`date_to`) done; UI
      tabs pending.

### B7. Academics
- [ ] **[P3]** (b) Classes: sort, filters, clearer UI.
- [ ] **[P2]** (d) Merge Sections into the Classes tab — sections are created and
      managed inline under their class (they're already FK-linked:
      `Section.class_id`). Kill the separate Sections tab.
- [ ] **[P2]** (e) Course mapping stays class-level (`ClassCourse` — already
      class-scoped ✓); make the UI reflect that clearly.
- [ ] **[P3]** (f) Course mapping: filters + sorting.
- [x] **[P1]** (g) Session switching leaks across roles/logins — fixed via
      per-user server-side preference (see A).
- [ ] **[P2]** (h) Rollover wizard: per-module copy-or-fresh choices — timetables,
      announcements, holidays, resources, forms, grading schemes, fee structures,
      etc. (`RolloverWizard.tsx` currently covers only enrollments/assignments).
- [x] **[P1]** (i) Only active session actionable, others view-only — core
      guards + banner in (see A); per-route adoption continues with screens.
- [ ] **[P2]** (j) Remove Teacher Assignment tab; assignments derive from timetable
      slots (see IMPLEMENT.md §4).
- [ ] **[P2]** (k) Per-class portal-access config: classes whose students get no
      portal produce guardian logins instead (`User.portal_enabled` exists per-user;
      add class-level default + guardian-login provisioning).

### B8. Assessments
- [ ] **[P2]** (a–c) Categories, sorting, edit/delete for assessments.
- [ ] **[P1]** (d–e) Redesign Grading course-wise, with filters, categories, tabs.
- [ ] **[P2]** (f–h) Results redesign: section-wise and class-wise spreadsheet view
      with column show/hide, report-style export (PDF/XLSX), per-section footer
      summary listing course → teacher. See IMPLEMENT.md §5.
- [x] **[P2]** (i) Teacher assigned in timetable automatically gets assessments +
      attendance roster access (derived scope — done, tested). Remaining:
      admin view of all teachers' assessments organized/sorted.
- [ ] **[P2]** (j) Admin (and delegates) can publish an assignment to all classes.
- [ ] **[P2]** Teacher teaching same course in multiple sections can publish one
      assignment to several sections at once (teacher portal).
- [ ] **[P2]** Teachers create assignments for own sections; admin can override
      and assign to sections / course-enrolled students / whole classes.

### B9. Resources
- [x] **[P2]** Audience model for resources/forms/announcements (§6 resolver:
      all/roles/classes/sections/courses/users) — backend done; audience-picker
      UI pending.
- [ ] **[P2]** Global + per-section resources; assignable by admin or teacher.
- [ ] **[P2]** Admin browses resources by class and section.
- [ ] **[P2]** Per-teacher categories; admin sees all categories + own global ones;
      admin can override any teacher's resources.
- [ ] **[P2]** Audience targeting: group (teachers/students), section, course
      enrollment, class.

### B10. Forms
- [ ] **[P3]** Categories + organization; fix giant checkboxes.
- [ ] **[P2]** Audience assignment (group / all / sections / course-enrolled /
      classes).
- [ ] **[P2]** Teachers with form permission can create/manage forms for their
      sections; admin overrides. Others respond-only.

### B11. People
- [ ] **[P2]** Reorganize: categorized list (name + username) with row actions —
      view-person modal (full formatted details) and send-login-link icon.
- [ ] **[P2]** "Add Teacher" top-right → modal with complete formal details
      (qualifications, CNIC, joining date, emergency contact, etc. — extend
      `TeacherProfile`).
- [ ] **[P2]** Same treatment for students.
- [ ] **[P2]** Students categorized by class; enrollment to class/courses and
      section selection all handled from People.
- [ ] **[P2]** Full guardian details per student (`Guardian`/`StudentGuardian`
      exist — surface in UI); guardian login link when class portal access is off.
- [ ] **[P2]** Donators tab (see B13).
- [ ] **[P2]** From a Teacher row: record salary; from a Student row: record fee.

### B12. Admissions
- [ ] **[P2]** Split into two: "Students in Person" (manual add; lives with People
      flow) and "Forms".
- [ ] **[P2]** Public admission forms per program, shareable like Google Forms;
      submissions land in a Registrations tab.
- [ ] **[P2]** Contact form as W3Forms-style public-key endpoint for the main
      website (`ContactEnquiry` model exists; add public key + public POST route).

### B13. Finance
- [ ] **[P2]** (a) Fees organized by class/course with filters.
- [ ] **[P2]** (b) Fee visible inside a selected student's record (Students in
      Person screen).
- [ ] **[P2]** (c) Donators auto-listed in People (new tab).
- [ ] **[P3]** (d) Donation filters.
- [ ] **[P2]** (e) Donator click-through → full donation history + add donation.
- [ ] **[P2]** (f) Add fee/salary directly from People rows.

### B15. Reports
- [ ] **[P2]** Organized/sorted report centre: report per section, per course,
      donors, salary, student fee — every scope × period combination, CSV/PDF.

### B16. Blog
- [ ] **[P3]** Card/preview UI instead of a table.
- [ ] **[P2]** Edit + delete.
- [ ] **[P2]** Public read endpoint for the marketing site.

### B17. Settings
- [ ] **[P1]** Replace key/value editor with a real settings page: categorized,
      typed controls (see IMPLEMENT.md §7). Keep `MadrasaSetting` as storage but
      define a typed catalogue.
- [ ] **[P2]** Madrasa details section (name, address, contacts) visible to all
      madrasa members.
- [ ] **[P2]** Madrasa logo upload.
- [ ] **[P2]** Idle/logout timeout per role.
- [ ] **[P2]** Feature-flag section is super-admin-only; admin can override all
      *settings* but never super-admin *feature flags*.

## C. Teacher portal

- [ ] **[P2]** Dashboard: direct "open class list" per taught section with course
      name; all student actions on that page.
- [ ] **[P2]** Assessments page = admin's, scoped to taught sections (derived from
      timetable, IMPLEMENT.md §4).
- [ ] **[P2]** Attendance page = admin's, scoped to taught sections, only if admin
      allows (permission-gated).
- [ ] **[P3]** Timetable: grid view only, own sections only.
- [ ] **[P3]** Holidays: own classes + global only.
- [ ] **[P3]** Announcements: teacher-audience + global only.
- [ ] **[P2]** Resources: upload for own sections if allowed; global resources
      visible; global upload if allowed; per-teacher permission toggles by admin.
- [ ] **[P3]** Forms: related only.
- [ ] **[P2]** Profile settings (missing entirely).
- [ ] **[P2]** Salary view (own salary records/payments — read-only).

## D. Student portal

- [ ] **[P2]** Dashboard redesign: own attendance calendar, test scores, organized
      layout.
- [ ] **[P3]** Scope everything to self: own attendance, own timetable, related
      announcements/resources/forms only.
- [ ] **[P1]** Remove from student nav: Admissions, Blog, Fee tracking (leaks
      admin views today — audit `navItems` role filtering in
      `app/src/data/mockData.ts` and enforce server-side too).
- [ ] **[P2]** Personal settings page.

## E. Additional findings (self-audit, "look for other things")

- [ ] **[P2]** Route-level authorization audit: nav hiding is not authorization —
      every backend route needs role/permission checks verified by tests
      (`backend/tests/`).
- [ ] **[P3]** Empty/loading/error states standardized across views.
- [ ] **[P3]** Date handling: Hijri support exists (`core/hijri.py`) — surface
      dual dates consistently in UI.
- [ ] **[P2]** Pagination on all list endpoints (People, announcements, resources…)
      — large madrasas will choke on unpaginated lists.
- [ ] **[P3]** Toast/confirm patterns for destructive actions (delete assessment,
      delete slot…).
