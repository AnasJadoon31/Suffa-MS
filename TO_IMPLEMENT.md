# Remaining work vs MMS-SRS v1.0

Status snapshot after the auth/permissions, people, operations, assessments, finance,
and reporting passes + the 5-screen demo UI (login, academics setup, people,
attendance, assessments, dashboard). Everything below is still open.

## Attendance (§4.4.2, §4.9)

- [ ] Enforce the 23:59 lock. `is_synced_late()` computes the flag but the sync
      endpoint never rejects a late online edit — anyone can still write to a
      locked day.
- [ ] Post-lock override endpoint: Principal-only, mandatory reason, full audit
      entry (FR-TCH-ATT-07). No correction/PATCH path exists at all yet.
- [ ] Teacher check-in/check-out times — `AttendanceEntry` sync schema still
      doesn't carry `check_in`/`check_out`; the columns are dead.
- [ ] Attendance summary report per student/class/date-range, excluding
      holidays and approved leave (FR-ATT-05). Holiday/Leave data exists
      (operations module), nothing reads it back for this.
- [ ] Missing-attendance drill-down view — dashboard only shows a count
      (`missing_sync_teachers`), no list of who.

## Messaging (§4.16)

- [ ] `POST /messaging/whatsapp-link` still takes a raw template string from
      the caller instead of looking up `MessageTemplate` by code + recipient's
      preferred language — the DB-backed bilingual template is unused.
- [ ] No dedicated "send report to parents" endpoint (prefilled from a
      student's result).
- [ ] No dedicated "send credentials" endpoint wired to `provision_login`.
- [ ] `MessageLog` never written — no dispatch record at all.

## Dashboards & Reporting (§4.18)

- [ ] Only one dashboard shape exists (Principal-flavored). Teacher dashboard
      (my classes, take-attendance shortcuts, pending submissions, my
      timetable) and Student dashboard (today's timetable, latest results,
      due assignments, resources, announcements) are not built.
- [ ] Report generation by chosen scope+period by, PDF/CSV export — only the
      old fake operations CSV export remains for the still-mocked keys.

## Assessments (§4.10, §4.11)

- [ ] Result-card PDF (bilingual, Hijri+Gregorian). No PDF library in
      `requirements.txt` yet (reportlab/weasyprint).

## Frontend screens not built (backend is real for all of these)

- [ ] Timetable / Holidays / Leave — no screen.
- [ ] Resources — no screen. Presign upload/download endpoints exist
      (`/api/v1/files/*`) but nothing calls them yet.
- [ ] Forms — no screen (builder or response viewer).
- [ ] Announcements — no screen.
- [ ] Finance (contributions/donations/summary) — no screen.
- [ ] Salary — no screen.
- [ ] Blog / Admissions / Settings — still the old fake `operations` mock
      dict; no real table behind blog or admissions at all (announcements
      got a real table, blog/admissions never did).

## Public marketing site (§4.18 FR-WEB)

- [ ] Still a static Next.js skeleton. No blog editor/routing, no contact
      enquiry storage, no admission application flow, nothing wired to the
      backend (which also has no admissions API yet).

## Security / NFR (§5)

- [ ] Rate limiting / lockout on auth endpoints (Should). Skipped earlier
      because an in-memory counter would be inconsistent across the 4
      gunicorn workers — needs Redis-backed state.
- [ ] Audit log is only written for permission grants and user provisioning.
      Attendance corrections and mark overwrites still won't be audited once
      those features exist (SRS treats audit log as the accountability
      backbone across all of them).

## i18n / RTL (§3.6)

- [ ] The 5 new screens (Academics, People, Assessments, and their forms) are
      English-only, no `t()` calls. Regression against the bilingual
      requirement, traded for speed to hit the pitch deadline.
- [ ] Urdu font still not loaded via `@font-face` — falls back silently.
- [ ] No real Hijri date conversion anywhere (the old hardcoded fake string
      was removed, nothing replaced it).

## Storage

- [ ] `StorageProvider`/presign endpoints exist and are wired to real MinIO
      creds, but no UI flow actually calls them yet (assignment attachments,
      resource files, result-card PDFs all still need this hooked up).
