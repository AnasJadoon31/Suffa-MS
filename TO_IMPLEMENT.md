# TO_IMPLEMENT — Verified portal issue programme (2026-07-22)

This checklist replaces the previous completion claims. An item remains open until its
automated tests pass and, for visible behaviour, a role-specific screenshot is reviewed.

Evidence columns: **U/C** unit or component test · **API** PostgreSQL integration/API test ·
**E2E** authenticated browser scenario · **Shot** screenshot/PDF render · **Done** link in
`IMPLEMENTED.md`.

## Current report

| ID | Requirement | U/C | API | E2E | Shot | Done |
|---|---|---|---|---|---|---|
| CURRENT-01 | Teacher dashboard loads without an internal-server error | — | ✅ B-DASH | ✅ UI-CURRENT | ✅ `CURRENT-01*` | ✅ V22 |
| CURRENT-02 | Reusable dynamic filters render inline throughout the portal | — | — | ✅ UI-CURRENT | ✅ `CURRENT-02*` | ✅ V22 |
| CURRENT-03 | B-Form label is meaningful and translated | ✅ I18N | — | ✅ UI-CURRENT | ✅ `CURRENT-03*` | ✅ V22 |
| CURRENT-04 | Student modal has clear identity/class sections and enrollment-aware actions | — | ✅ B-ENROLL | ✅ UI-CURRENT | ✅ `CURRENT-04*` | ✅ V22 |
| CURRENT-05 | Guardian details are structured, readable, and visually polished | — | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-05*` | ✅ V22 |
| CURRENT-06 | Donors can be searched by name or contact | — | ✅ B-DONOR | ✅ UI-CURRENT | ✅ `CURRENT-06*` | ✅ V22 |
| CURRENT-07 | Admission Form filters use the shared inline filter | — | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-07*` | ✅ V22 |
| CURRENT-08 | Admission form type dialog has a meaningful translated title | ✅ I18N | — | ✅ UI-CURRENT | ✅ `CURRENT-08*` | ✅ V22 |
| CURRENT-09 | Forms and modals use consistent, comfortable field spacing | — | — | ✅ UI-CURRENT | ✅ `CURRENT-09*` | ✅ V22 |
| CURRENT-10 | Teacher grading and attendance expose the same assigned roster | — | ✅ B-SCOPE | ✅ UI-CURRENT | ✅ `CURRENT-10*` | ✅ V22 |
| CURRENT-11 | Delegated permissions open the granted Academics features | — | ✅ B-SCOPE | ✅ UI-CURRENT | ✅ `CURRENT-11*` | ✅ V22 |
| CURRENT-12 | Reports/results PDFs are polished and follow the user's language | ✅ B-PDF | ✅ B-PDF | ✅ PDF-RENDER | ✅ `result-report-*` | ✅ V22 |
| CURRENT-13 | Grading Setup is a coherent class/course grading-plan workflow | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| CURRENT-14 | Choice fields use add/remove/reorder option rows, not comma parsing | ✅ UI-FORM | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-14*` | ✅ V22 |
| CURRENT-15 | Student attendance is recorded per timetable course/period | ✅ B-ATTEND | ✅ B-ATTEND | ✅ UI-CURRENT | ✅ `CURRENT-15*` | ✅ V22 |
| CURRENT-16 | Form responses show an Actions column and readable response viewer | — | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-16*` | ✅ V22 |
| CURRENT-17 | Modal corners remain rounded when content scrolls | — | — | ✅ UI-CURRENT | ✅ `CURRENT-08_rounded*` | ✅ V22 |
| CURRENT-18 | Applications are editable/reversible and acceptance converts atomically | ✅ B-ADMIT | ✅ B-ADMIT | ✅ UI-CURRENT | ✅ `CURRENT-18*` | ✅ V22 |
| CURRENT-19 | Student view/edit includes profile, guardian, enrollment, and admission data | — | ✅ B-ADMIT | ✅ UI-CURRENT | ✅ `CURRENT-19*` | ✅ V22 |
| CURRENT-20 | Add Student starts from any open/closed Admission Form template | ✅ B-ADMIT | ✅ B-ADMIT | ✅ UI-CURRENT | ✅ `CURRENT-20*` | ✅ V22 |

## Issues.pdf regression set

| ID | Requirement | U/C | API | E2E | Shot | Done |
|---|---|---|---|---|---|---|
| PDF-01 | People navigation uses Applications terminology correctly | ✅ I18N | — | ✅ UI-CURRENT | ✅ current screens | ✅ V22 |
| PDF-02 | Teachers can submit forms addressed to everyone | — | ✅ B-SCOPE | ⏳ live-role | ⏳ | ⏳ |
| PDF-03 | Student modal shows username/class, no duplicate close/name, and entity edits | — | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-03*` | ✅ V22 |
| PDF-04 | Guardian rows have a View action | — | — | ✅ UI-CURRENT | ✅ `CURRENT-05*` | ✅ V22 |
| PDF-05 | A guardian can be linked to a student during creation | — | ✅ B-FULL | ⏳ live-role | ⏳ | ⏳ |
| PDF-06 | Student/Donor detail views have no duplicate close/name controls | — | — | ✅ UI-CURRENT | ✅ student + donor list | ✅ V22 |
| PDF-07 | Modals have usable desktop and mobile widths | — | — | ✅ UI-CURRENT | ✅ desktop/mobile modal | ✅ V22 |
| PDF-08 | Destructive confirmation uses the application dialog, not browser alert | — | — | ⏳ destructive journey | ⏳ | ⏳ |
| PDF-09 | Closed Admission Forms can be deleted without losing applications | — | ✅ B-FULL | ✅ UI-FORM | — | ✅ V22 |
| PDF-10 | Inquiries spelling, form-type dialog, category/program filters are correct | ✅ I18N | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-07/08*` | ✅ V22 |
| PDF-11 | Edit works and configured English/Urdu madrasa name appears everywhere | ✅ I18N | ✅ B-FULL | ⏳ all-role branding | ⏳ | ⏳ |
| PDF-12 | Grading configuration has an explicit working Save action | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-13 | Grading supports course defaults and optional class overrides | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-14 | Student result card downloads successfully | ✅ B-PDF | ✅ B-PDF | ⏳ three-role download | ✅ PDF page | ⏳ |
| PDF-15 | PDFs are decorated and generated in the current user's language | ✅ B-PDF | ✅ B-PDF | ✅ PDF-RENDER | ✅ EN/UR pages | ✅ V22 |
| PDF-16 | Teachers upload resources for their timetable teaching scope | — | ✅ B-SCOPE | ⏳ live-role upload | ⏳ | ⏳ |
| PDF-17 | PWA header controls fit mobile widths | — | — | ✅ UI-AUDIT | ✅ mobile EN/UR | ✅ V22 |
| PDF-18 | Tables remain usable on mobile/PWA | — | — | ✅ UI-AUDIT | ✅ mobile EN/UR | ✅ V22 |
| PDF-19 | Granted teacher permissions are honoured | — | ✅ B-SCOPE | ✅ UI-CURRENT | ✅ `CURRENT-11*` | ✅ V22 |
| PDF-20 | Leave actions do not overlap | — | — | ✅ UI-AUDIT | ✅ leave mobile | ✅ V22 |
| PDF-21 | Form labels generate internal keys; field_key is not user-facing | ✅ UI-FORM | ✅ B-FULL | ✅ UI-FORM | ✅ builder modal | ✅ V22 |
| PDF-22 | Students can be explicitly assigned/unassigned to a class | — | ✅ B-ENROLL | ✅ UI-CURRENT | ✅ student modal | ✅ V22 |
| PDF-23 | Mutating actions show loading and prevent duplicate clicks | — | ✅ B-FULL | ⏳ loading-state journey | ⏳ | ⏳ |
| PDF-24 | All filterable screens use the dynamic inline filter | — | — | ✅ UI-AUDIT | ✅ filter screens | ✅ V22 |
| PDF-25 | No untranslated `searchBtn` key is rendered | ✅ I18N | — | ✅ UI-CURRENT | ✅ EN/UR screens | ✅ V22 |
| PDF-26 | Urdu text has correct spacing and does not overlap | ✅ I18N | — | ✅ UI-AUDIT | ✅ mobile Urdu | ✅ V22 |
| PDF-27 | Grading includes assignment pool weight and class upload limit | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-28 | Students can see results and assignment marks | ✅ B-FULL | ✅ B-FULL | ⏳ live student | ⏳ | ⏳ |
| PDF-29 | Teachers can add assignment remarks | — | ✅ B-FULL | ⏳ live teacher | ⏳ | ⏳ |
| PDF-30 | Submitted assignment remains downloadable and chooser is hidden afterward | — | ✅ B-FULL | ⏳ live student | ⏳ | ⏳ |
| PDF-31 | Student dashboard is complete and visually verified | — | ✅ B-FULL | ⏳ live student EN/UR | ⏳ | ⏳ |

## Release gates

- [ ] Alembic upgrades a populated PostgreSQL legacy database through both historical NOT NULL migrations. Static upgrade-to-head and focused migration regressions pass; the live populated-PostgreSQL gate remains.
- [ ] Full backend suite passes against PostgreSQL with tenant/RLS coverage.
- [x] Frontend TypeScript build and missing-i18n-key audit pass.
- [ ] Principal, delegated-teacher, teacher, student, and guardian Playwright journeys pass in EN/UR and desktop/mobile viewports.
- [ ] Every required screenshot is reviewed. The complete `CURRENT-*` set and EN/UR PDF pages are stored under `app/artifacts/issue-verification/`; the open `PDF-*` role journeys above still need capture.
- [ ] Docker Compose starts backend, worker, app, and web; `/readyz` and frontend health checks pass. Compose configuration resolves all four services, but this workstation cannot access `/var/run/docker.sock`.
- [x] Code review reports no unresolved critical/high implementation finding.

## Evidence catalogue

- **V22** — [2026-07-22 verified current-issue implementation](IMPLEMENTED.md#2026-07-22--verified-current-01-through-20-implementation).
- **B-FULL** — backend `pytest`: **179 passed** after the historical leave/holiday regressions (final rerun required before commit if this count changes).
- **B-DASH / B-DONOR / B-SCOPE / B-PDF** — focused tests in `test_current_portal_issues.py` and `test_reported_portal_issues.py`.
- **B-ADMIT / B-ATTEND / B-ENROLL / B-GRADE** — focused suites `test_admission_conversion.py`, `test_attendance_period_enrollment_history.py`, and `test_assessments_redesign.py`.
- **BUILD / I18N** — production Vite/TypeScript build and the 910-key static i18n audit.
- **UI-CURRENT** — `npm run test:visual-issues`; automated principal/delegated-teacher mocked-API UI journeys and named screenshots.
- **UI-FORM** — `npm run test:admission-builder`; create/edit/render/submit browser regression.
- **UI-AUDIT** — reviewed EN/UR desktop/mobile captures under `app/artifacts/ui-audit/final/`.
- **PDF-RENDER** — deterministic EN/UR report PDFs and page renders under `app/artifacts/issue-verification/`.
