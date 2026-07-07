# Remaining work vs MMS-SRS v1.0

Status snapshot after the auth/permissions, people, operations, assessments, finance,
and reporting passes + the 5-screen demo UI (login, academics setup, people,
attendance, assessments, dashboard), followed by a full pass closing every item
below (attendance lock/override, messaging, dashboards, reporting exports,
result-card PDFs, rate limiting, audit coverage, i18n, storage wiring, and the
public marketing site).

## Attendance (§4.4.2, §4.9)

- [x] Enforce the 23:59 lock. Sync now rejects late writes (`locked` list in the
      response) instead of silently accepting them.
- [x] Post-lock override endpoint: `POST /attendance/override`, gated by the
      `attendance.edit_locked` permission, mandatory `reason`, full audit entry
      via `record_audit` (action `attendance.override`).
- [x] Teacher check-in/check-out — `AttendanceEntry` sync schema now carries
      `check_in`/`check_out` and the sync route persists them onto
      `TeacherAttendance`.
- [x] Attendance summary report per student/class/date-range, excluding
      holidays and approved leave (`GET /attendance/summary/{subject_type}/{id}`,
      plus the class-scoped CSV/PDF export under `/reporting/reports/attendance`).
- [x] Missing-attendance drill-down — dashboard now returns
      `missing_sync_teacher_list` alongside the count.

## Messaging (§4.16)

- [x] `POST /messaging/whatsapp-link` looks up `MessageTemplate` by code +
      recipient language instead of taking a raw template string.
- [x] `POST /messaging/send-report` — prefilled from a student's published
      result, sent to the primary guardian.
- [x] `POST /messaging/send-credentials` — wired to whichever profile
      (teacher/student→guardian) owns the freshly provisioned login.
- [x] `MessageLog` is now written on every dispatch. (Also dropped the
      `recipient_id → users.id` FK since recipients are polymorphic —
      guardians/students/teachers, not always a `users` row.)
- [x] Basic template CRUD (`GET/POST /messaging/templates`) plus default
      `performance_report`/`credentials` templates seeded in `bootstrap.py`.

## Dashboards & Reporting (§4.18)

- [x] Teacher dashboard (my classes, pending submissions, today's timetable)
      and Student dashboard (today's timetable, latest result, due
      assignments, resources, announcements) — `GET /reporting/dashboard` now
      branches on role; frontend `DashboardCards.tsx` renders per-role.
- [x] Report generation by scope + period, PDF/CSV export —
      `GET /reporting/reports/attendance` and `/reporting/reports/finance`,
      both real queries with `format=csv|pdf`. The old in-memory `reports`
      mock module (and its generic `/{module_key}` scaffolding) was removed
      from the operations router.

## Assessments (§4.10, §4.11)

- [x] Result-card PDF (bilingual English/Urdu, Hijri+Gregorian date) —
      `GET /assessments/results/card` (staff) and `/results/card/me` (portal
      student), built with `reportlab` + `hijri-converter` +
      `arabic-reshaper`/`python-bidi` for correct Urdu shaping, using the
      bundled Noto Nastaliq Urdu font (`backend/app/assets/fonts/`).

## Frontend screens not built (backend is real for all of these)

- [x] Timetable / Holidays / Leave — screen added (`TimetableView.tsx`).
- [x] Resources — screen added (`ResourcesView.tsx`), wired to the real
      presign upload/download endpoints.
- [x] Forms — screen added (`FormsView.tsx`): builder + response viewer.
- [x] Announcements — screen added (`AnnouncementsView.tsx`).
- [x] Finance (contributions/donations/summary) — screen added
      (`FinanceView.tsx`).
- [x] Salary — screen added (`SalaryView.tsx`).
- [x] Blog / Admissions — real tables, real routes, screens
      (`BlogView.tsx`, `AdmissionsView.tsx`). Admission submission is
      unauthenticated (walk-in/public intake); review gated by
      `students.provision`. Public blog listing is now anonymous-readable
      (published-only) for the marketing site.
- [x] Settings — real `madrasa_settings` key/value table, route, and screen
      (`SettingsView.tsx`).
- [x] Reports — screen added (`ReportsView.tsx`), scope+period CSV/PDF export
      for attendance and finance.

## Public marketing site (§4.18 FR-WEB)

- [x] Blog section fetches real published posts server-side
      (`web/src/lib/api.ts` → `GET /operations/blog?published_only=true`,
      now anonymous-readable).
- [x] Contact enquiry storage — new `ContactEnquiry` model/table
      (`contact_enquiries`), public `POST /operations/enquiries`, staff
      `GET`/status-update endpoints gated by the new
      `contact.enquiries.view` permission, reviewed from `AdmissionsView.tsx`.
- [x] Admission application flow — `AdmissionForm.tsx` posts to the existing
      (already-public) `POST /operations/admissions`.
- [x] `NEXT_PUBLIC_API_BASE` wired up (`web/.env.example` added); both forms
      and the blog fetch go through `web/src/lib/api.ts`.

## Security / NFR (§5)

- [x] Rate limiting / lockout on auth endpoints — Redis-backed
      (`app/core/rate_limit.py`), 5 failed attempts locks the
      `(tenant, username)` pair for 15 minutes. Consistent across all
      gunicorn workers since state lives in Redis, not in-process memory.
- [x] Audit log now also covers attendance overrides
      (`attendance.override`) and mark overwrites
      (`assessments.mark_overwrite`), on top of the existing permission
      grants and user provisioning entries.

## i18n / RTL (§3.6)

- [x] Academics, People, and Assessments screens (+ their inline forms) now
      use `t()` throughout, with matching `en`/`ur` entries in
      `app/src/i18n/index.ts`.
- [x] Urdu font now actually loads: `NotoNastaliqUrdu-{Regular,Bold}.ttf`
      bundled under `app/public/fonts/` and registered via `@font-face` in
      `styles.css` (previously referenced a font family that was never
      shipped, so it silently fell back).
- [x] Real Hijri date conversion — `app/core/hijri.py` (via
      `hijri-converter`), surfaced through `GET /academics/today` and shown
      in the app topbar, and used for the Gregorian+Hijri date line on
      result-card PDFs.

## Storage

- [x] Assignment attachments — teachers can attach a file when creating an
      assignment (presign-upload), students/teachers can download it.
- [x] Assignment submissions — students upload their work from the dashboard
      "Due assignments" list (presign-upload → `POST .../submissions`);
      teachers can download a submitted file from the submissions table.
- [x] Result-card PDFs are generated and streamed on demand rather than
      round-tripped through object storage (no stale-cache concern, and the
      SRS requirement was "a downloadable bilingual PDF exists", not
      "stored in MinIO").
