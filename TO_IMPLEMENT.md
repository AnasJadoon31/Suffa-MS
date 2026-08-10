# TO_IMPLEMENT — Active portal issue programme (2026-07-23)

This checklist is the source of truth for unresolved portal work. An item remains open
until its automated tests pass and, for visible behaviour, a role-specific screenshot is
reviewed. Previously verified July 22 items are retained below as historical evidence;
they do not close or weaken the new July 23 requirements.

## 2026-08-09 — Attendance History Seed Visibility Follow-Up

- Status: Shared filter buttons are now used on Announcements, Forms, Blog, Reports, and Timetable, in addition to the screens that already had `FilterBar`.
- Status: Madrasa Settings now renders logo as an upload control and default language as an English/Urdu dropdown.
- Status: Seeded enrollment dates now cover seeded attendance dates, and attendance history includes general daily rows under course-filtered views. The frontend now moves the selected date to the latest available history entry when today has no rows.
- Status: School days are now configurable from Madrasa Settings through `attendance.school_days`; the seed and live DB default are Monday-Saturday, and the live DB has August 8, 2026 attendance rows for all seeded students and teachers.
- Remaining release work:
  - Run browser smoke on `/settings` to confirm the logo uploader, default-language dropdown, and weekday selector layout in English and Urdu.
  - Run browser smoke on `/announcements`, `/forms`, `/blog`, `/reports`, and `/timetable` to confirm the filter buttons open cleanly on mobile and desktop.
  - Run browser smoke on `/attendance` after frontend refresh to confirm the calendar visually lands on the seeded latest date.

## 2026-08-09 — Results Publish and Seed Follow-Up

- Status: Publish Results now sends the active results-matrix session ID instead of an empty UUID. The Docker Postgres DB was reset, migrations were replayed, and the expanded full madrasa seed was loaded.
- Status: Seeded fixture now covers the full `1448 / 2026-27` academic year: 432 timetable slots, 528 assignments including 204 admin-created assignments, submissions, marks, published results for all students, full-session attendance, monthly fees, recurring donations, and monthly salary payments.
- Remaining release work:
  - Run a browser smoke after the frontend refreshes to confirm the new global Assessments and My Assessments flows render cleanly with the new fixture.
  - Add explicit guardian-profile result visibility coverage if guardians need a dedicated result tab beyond linked ward/report access.

## 2026-08-09 — Teacher-Scoped My Assessments Follow-Up

- Status: `/my-assessments` now has Assignments, Marking, and Results tabs. Assignment reads and assignment creation use `mine_only=true`, and admin/principal teachers are scoped through their linked teacher profile. Assignment create/filter options plus Marking/Results filters are sourced from the user's own timetable. The global `/assignments` surface is now labelled Assessments and has Assignments, Marking, and Results tabs for madrasa-wide work.
- Status: The backend container on port `8001` was rebuilt/recreated after the route changes and `/healthz` is healthy.
- Remaining release work:
  - Add regression coverage for admin/principal users with linked teacher profiles across `/my-timetable` and `/my-assessments`.

## 2026-08-09 — Admin Teacher Timetable Access Follow-Up

- Status: `/api/v1/operations/timetable/me` now serves the teacher timetable for admin/principal users who have a linked teacher profile.
- Remaining release work:
  - Add a focused regression later for principal/admin users with teacher profiles once the authenticated browser/API route pack is restored.

## 2026-08-09 — My Timetable Error Text Follow-Up

- Status: `/my-timetable` now translates the `timetable_self_service_only` backend code into readable English and Urdu text.
- Remaining release work:
  - Decide whether admin/principal users should be redirected away from self-service timetable routes or shown a role-specific timetable management link.

## 2026-08-09 — Dependent Student Phone Follow-Up

- Status: Dependent student cards no longer show a separate Phone row, and the student form only exposes Phone for independent students.
- Remaining release work:
  - Existing dependent students with stored phone values are cleared when next saved; add a one-time data cleanup if historical phone values must be removed immediately.

## 2026-08-08 — Donor Editing Follow-Up

- Status: Opened donor cards now include a single action-row Edit button, show the donor's total donated amount, and the donor form saves name/contact changes through the finance API.
- Remaining release work:
  - Add donor edit coverage to the future authenticated browser regression pack once the route harness is restored.

## 2026-08-08 — WhatsApp Evolution Settings Follow-Up

- Status: Evolution API v2 URL/key/instance/webhook settings are no longer editable from Madrasa Settings; messaging now reads them from env only.
- Status: Local `.env` is configured for the provided Evolution URL/API key and `suffa-ms` instance; `/settings/catalog` exposes no `whatsapp.*` config rows.
- Status: Connected sessions now show the Evolution owner phone/JID when reported, and admins can close the current Evolution instance before pairing another phone.
- Status: Opened student, teacher, and guardian person cards now expose WhatsApp credential sending; independent students can use their own registered phone and linked students can use guardian phones.
- Status: Dependent students are now blocked from being created or updated without a guardian, the last guardian link cannot be removed, and existing invalid dependent records show a person-card warning with WhatsApp credential sending disabled until a guardian phone is linked.
- Status: Finance payment and donation rows can now send PDF receipts through WhatsApp; student payments use dependent/independent recipient rules and donations use the donor contact.
- Remaining release work:
  - Backfill existing legacy/local dependent students that already have no guardian by linking the correct guardians; the UI now surfaces these records but does not infer relationships automatically.
  - Configure production tenant values and run `~/.agents/skills/evolution-api/evolution-check.sh <instance>` with the live URL/key before claiming live WhatsApp health.
  - Keep Evolution server env hardened separately: `DATABASE_ENABLED=true`, persistent Postgres, and `DEL_INSTANCE=false`.
  - Delivery success for credentials, reports, and receipts still requires Evolution `MessageUpdate` ACK verification, not only HTTP 201.

## 2026-08-08 — Attendance History Correction Follow-Up

- Status: Principals/admins with `attendance.edit_locked` can now correct manual student attendance history from `/attendance`; focused backend tests, frontend build, and mocked EN/UR browser smoke passed.
- Remaining release work:
  - Add this journey to the rebuilt authenticated route/browser regression pack once the current TanStack test harness is restored.
  - Keep approved-leave generated rows read-only in Attendance. To change those days, reject or update the linked leave request so the leave audit trail remains authoritative.

## 2026-08-02 — Frontend Completion Recovery Follow-Up

- Status: Core completion work landed for `/me`, assignments, admissions review/conversion, staff/student results, typed settings, resource uploads/edits, announcement/blog/holiday edits, linked-people refresh consistency, and the unsupported-role dashboard fallback.
- Remaining release work:
  - Recreate a compact authenticated route/runtime browser gate for the current TanStack routes so `/profile`, `/my-profile`, auth redirects, and common portal screens are checked automatically again.
  - Run focused browser fundamentals for login, persisted token/tenant state across refresh, logout, protected-route handling, and legacy profile redirects on the current frontend.
  - Finish parity on still-thin management areas: finance detail/edit history, reports filter parity, timetable edit/conflict management, leave review/history, and any remaining linked-entity refresh gaps discovered during browser use.
  - Expand People and Academics browser verification from API/build confidence to end-to-end create/edit/detail/deactivate and relationship-management flows on current TanStack screens.
  - Validate admissions conversion against a richer fixture set covering independent students, guardian overrides, and multiple open admission forms.
  - Add focused upload/download validation for resources and assignments covering at least one real file replacement and one staff review path in-browser.

## 2026-08-02 — Frontend Replacement Follow-Up

- Status: The `app/` frontend has been replaced by the TanStack Start design and smoke-verified against the local FastAPI backend for login, token/tenant state, representative authenticated routes, legacy profile redirects, public set-password rendering, PWA build output, Compose config, and generated Node-server startup.
- Remaining release work:
  - Rebuild route-specific browser regression coverage for the new TanStack/Radix frontend. The old `app/scripts/*` checks were tied to removed MUI/React Router markup and are no longer valid.
  - Run a full role journey matrix for principal, teacher, student, guardian, and super-admin once fixtures/users are refreshed for the new UI.
  - Recreate EN/UR and RTL visual verification for the new design. The smoke pass covered mobile and desktop English only.
  - Validate a real public admission token end to end after creating/opening an admission form in the new UI; the local database had no public admission forms during replacement verification.
  - Confirm the updated frontend Docker image build in CI/Coolify. Local image validation was blocked by containerized npm install behavior after Node/runtime alignment fixes.
  - Revisit the unrelated backend attendance regression observed during full-suite verification: `test_roster_infers_single_current_day_period_from_course` returned 409 for multiple periods instead of the expected inferred roster.
  - Address imported-design lint warnings for Fast Refresh exports and hook dependency memoization before treating `npm run lint` as a zero-warning gate.

## 2026-08-01 — PWA Visual Redesign Remaining Gate

- Status: Foundation batch and custom MUI wrapper migration are implemented and verified for build, i18n, route runtime, drawer geometry, mobile records, students layout, assessment mobile cards, scripted current-issues journeys, and static UI-wrapper enforcement.
- Release blocker: `cd app && npm run test:appwide-visual` still reports route-specific visual failures, so `npm run test:mobile-pwa` is not yet a valid final gate.
- Remaining acceptance work:
  - Continue migrating screen-specific visual structures to semantic shared components where appwide visual findings remain; the current static gate now prevents direct MUI component imports outside `app/src/components/ui/`.
  - Resolve appwide visual audit overlaps in People, Admission Forms, Salary, Reports, Assessments setup, Finance donations, and dashboard quick/action rows at `320`, `390`, `768`, and `920px`.
  - Finish secondary route polish for Timetable, Leave, Announcements, Blog, Settings, Profile, parent/student dashboard cards, and public admission where the appwide matrix still reports clipped or overlapping controls.
  - Re-run `npm run test:appwide-visual`, then `npm run test:mobile-pwa`, and archive/review screenshots under `app/artifacts/ui-audit/pwa-appwide-release/`.
  - Keep only documented matrix exceptions; normal records must use shared table/card primitives.

## 2026-08-01 — Attendance Course Selection Follow-Up

- Status: No additional backlog item opened for the route-wide invalid-hook/runtime cleanup; React dependency dedupe, dev service-worker cleanup, 33-route runtime scan, PWA status check, profile runtime check, attendance regression, and frontend build passed.
- Status: No additional backlog item opened for the Profile `RadioGroup` invalid-hook crash; profile runtime regression, attendance regression, frontend build, and live `/my-profile` smoke passed.
- Status: No additional backlog item opened for single-course teacher auto-selection; frontend build, focused attendance prompt regression, and live teacher smoke passed.
- Status: No additional backlog item opened for the Attendance console/runtime cleanup; frontend build, console-aware attendance regression, and live backend browser smoke passed.
- Status: No additional backlog item opened for the prompt clarification; focused attendance regression and frontend build passed.
- Status: No additional backlog item opened for the route-reset/period-inference fix; focused backend attendance regressions, browser attendance regression, and frontend build passed.

Evidence columns: **U/C** unit or component test · **API** PostgreSQL integration/API test ·
**E2E** authenticated browser scenario · **Shot** screenshot/PDF render · **Done** link in
`IMPLEMENTED.md`.

## Issues 3 report — open regression set (2026-07-23)

Source: `/home/anas/Downloads/Issues.pdf` (16 pages, created 2026-07-23).

Status legend: **OPEN** not started · **WIP** implementation/test in progress ·
**BLOCKED** requires an explicit product/data decision · **DONE** all stated evidence exists.

### A. Shared interaction and presentation foundations

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-001 | P0 | Create one reusable, accessible row **Action menu** component and replace multi-button action clusters project-wide (People, Applications, Admission Forms, Assessments, Forms, Finance, Salary, and any other table with more than one action). The trigger and menu must fit one row, support keyboard navigation/Escape/outside click, use translated labels, distinguish destructive actions, and remain usable on mobile cards. | U/C menu interaction and focus tests; E2E representative view/edit/delete/download flows on desktop/mobile EN/UR; reviewed screenshots of every migrated table family. | DONE |
| ISS3-002 | P0 | Rebuild the People → Students header/filter/table layout. Filters and **Add student** stay in one intentional responsive toolbar; Portal/Status columns use content-sized widths; Actions never clip or wrap unpredictably; the table has no page-level horizontal overflow. | E2E at 1440, 768, and 390 px with 10+ rows; geometry assertions; EN/UR screenshots. | DONE |
| ISS3-003 | P0 | Never render raw set-password/login URLs inline after creating or reissuing credentials. Show a compact success state with copy/send actions; long links must not expand the page. | U/C state test; E2E create/reissue at desktop/mobile; assert token/link text is absent from normal page content. | DONE |
| ISS3-004 | P1 | Replace every remaining `window.alert`, `window.confirm`, and `window.prompt` with application-owned translated dialogs. Warnings show consequences; destructive confirmation names the target and blocks duplicate submission. | Static source gate plus U/C dialog tests; E2E representative destructive, warning, and text-input confirmations. | DONE |
| ISS3-005 | P1 | Add one application-level snackbar/toast system for real-time notifications and mutation success/failure/pending status. It must queue rather than overwrite messages, be screen-reader announced, translated, dismissible, and must not replace blocking confirmation dialogs. | U/C queue/timer/ARIA tests; E2E success, API error, offline, and background notification cases. | DONE |
| ISS3-006 | P0 | Establish project-wide type safety and boundary validation: no new untyped API payloads or rendered error objects; shared request/response types; Pydantic validation for identifiers, dates, phone numbers, money, enums, and cross-field rules; frontend forms show field-specific translated errors. Ratchet—not blanket-disable—existing `any` usage and add CI gates. | TypeScript strict build; typed endpoint contract; schema/API negative tests; static `any`/unsafe-cast baseline that may only decrease; E2E 422 rendering. | DONE |

### B. Students, guardians, admissions, and identity

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-007 | P0 | Student edit must include the complete stored admission information (selected form, program, submitted answers, identity, medical/prior-school data, guardian data where applicable), with permission and active-session enforcement. Editing must preserve fields not present in the chosen template. | API read/update/authorization tests; E2E edit/reopen persistence with custom admission fields; modal screenshots. | DONE |
| ISS3-008 | P0 | Admission numbers are server-generated, tenant-unique, immutable identifiers. Remove editable admission-number inputs from create, edit, application acceptance, imports, and normal APIs. Concurrent creation must not collide; legacy values remain readable. | PostgreSQL concurrency/uniqueness tests; API rejection of client-supplied changes; E2E create/edit assertions. | DONE |
| ISS3-009 | P0 | Usernames are proposed automatically from the person’s normalized name using a deterministic tenant-unique suffix strategy for collisions. The proposal is visible and editable before account creation; final uniqueness is enforced atomically server-side for teacher, student, guardian, and principal-managed provisioning. | U/C normalization cases (Urdu, punctuation, duplicate names); PostgreSQL concurrency tests; E2E preview/edit/create. | DONE |
| ISS3-010 | P0 | **Submit application** starts by choosing an Admission Form. The selected form drives program/defaults, required system sections, and custom questions; submission without a form is impossible. Closed forms may be viewed historically but cannot receive new applications. | API form binding/closed-form tests; E2E choose-form-first, validation, and persisted-answer journey. | DONE |
| ISS3-011 | P0 | Guardian handling in application/student creation explicitly supports **Link existing**, **Create new**, and **Independent student**. Existing guardians use an async searchable multi-select rather than a checkbox wall; duplicate CNIC/phone matches are surfaced before creating another record. | API duplicate/link/tenant-scope tests; E2E search, select multiple, create new, and independent paths at scale (100+ guardians). | DONE |
| ISS3-012 | P0 | A student may have zero, one, or multiple guardians, and a guardian may have multiple wards. Linking/unlinking is idempotent and tenant-safe; role/relationship and portal access are stored per guardian/link where appropriate. Correct the existing “multiple guardians assigned to single guardian” ambiguity to this many-to-many contract. | Database constraint/migration tests; API authorization/idempotency tests; E2E both relationship directions and guardian child switcher. | DONE |
| ISS3-013 | P0 | Applications cannot be submitted, accepted, converted, or otherwise mutated while an archived academic session is selected. Acceptance always targets the active session unless an explicitly authorized migration workflow is later designed. UI hides/disables controls and the API rejects bypasses. | API archived-session mutation tests; E2E session switch and disabled controls; no mutation request emitted. | DONE |
| ISS3-014 | P0 | Application submission/acceptance exposes explicit portal decisions for the student and every guardian: enabled/disabled, account username proposal, and delivery target. Independent students require their own contact details; disabling a portal must prevent credential issuance. | API provisioning matrix; E2E student-only, guardian-only, both, and neither; audit-log assertions. | DONE |
| ISS3-015 | P1 | Student profiles support an optional normalized phone number independently of guardian contact data. Independent status must be visible in detail/edit views and must not fabricate a guardian relationship. | Schema/API tests; E2E independent student create/edit/view; reports/exports retain the phone safely. | DONE |
| ISS3-016 | P0 | General admission forms include configurable **Student** and repeatable **Guardian** system sections. Admins may enable/disable system fields without deleting their definitions; `+ Add guardian` supports multiple guardians. Acceptance atomically creates/links the student and all declared guardians, while allowing a valid no-guardian/independent submission. | Builder U/C tests; API schema/versioning and atomic conversion rollback tests; E2E build → submit → accept → verify links. | DONE |
| ISS3-017 | P2 | Rename “General public form” to **General form** everywhere. “Public” describes distribution, not the form’s data model; the same form can be used internally by Add Student and externally by link. | I18N/static key audit and EN/UR chooser screenshots. | DONE |

### C. Phone numbers, WhatsApp, and credential delivery

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-018 | P0 | WhatsApp Settings offers both **QR code** and **phone-number pairing** in one coherent connection flow. Switching methods invalidates/replaces only an incomplete pairing after confirmation; connected sessions cannot be accidentally replaced. Status polling and recovery work for both methods. | Evolution API contract tests using the required skill/runbook; E2E QR and pairing-code state machines; desktop/mobile screenshots. | DONE |
| ISS3-019 | P0 | Introduce one shared Pakistan phone-number value object/input used everywhere. The visible input has a fixed `+92` prefix; accept common local input such as `03…`, normalize storage/delivery to E.164 `+923…`, reject invalid lengths/prefixes, and never double-prefix. Existing valid records require a data migration/backfill report. | Property/unit normalization tests; migration dry-run/integration tests; API negative tests; E2E all person/application/settings forms. | DONE |
| ISS3-020 | P1 | Add a `phone` custom-field type to the form builder. It uses the shared phone component/validation, persists a normalized value, renders correctly on public/internal forms, and exports/displays in a human-readable form. | Builder/schema/API tests; E2E create → submit → edit/view → export in EN/UR. | DONE |
| ISS3-021 | P0 | Send new/reissued login links through Evolution API from the application. The admin chooses an eligible student/guardian/teacher phone when more than one exists, sees delivery progress/result, can retry safely, and receives a copy fallback only when delivery genuinely fails. Tokens and full links must not enter logs or page text. | Evolution API request/idempotency tests; API authorization/audit tests; E2E send/success/failure/retry; secret-redaction log assertion. | DONE |

### D. Finance, salary, and reports

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-022 | P1 | Clicking a student/payer/donor identity in Finance opens a structured profile modal with contact/profile data and the person’s complete contribution/donation/payment history. Rows remain keyboard accessible; receipt actions remain in the Action menu; tenant permissions prevent cross-person/cross-tenant access. | API person-history tests; E2E keyboard/click/modal/history journey; desktop/mobile screenshots. | DONE |
| ISS3-023 | P0 | Redesign Salary as a salary-history screen. The default view is a table of recent salary records/payments with teacher, amount, effective/paid date, period, method, and status. A primary **Record salary** action opens a teacher-search/select modal; row Action menus provide view/edit/delete with audit and active-session rules. Empty/loading/error states must not collapse into a tiny selector. | API CRUD/history/permission/audit tests; E2E record/edit/delete/filter journey; responsive screenshots with many rows. | DONE |
| ISS3-024 | P1 | Reports date filters provide quick ranges: **1 week, 1 month, 3 months, 6 months, 1 year**. A quick range sets exact From/To dates in the madrasa timezone, remains editable, indicates the active preset, and is shared by all applicable reports. | U/C boundary/leap-year/timezone tests; E2E preset selection and generated-report query assertions. | DONE |

### E. Forms and responses

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-025 | P0 | Form responses must resolve and display the real respondent and relevant student/ward; valid linked records must never appear as “Unknown person.” Preserve a historical fallback only for genuinely deleted/unresolvable actors and label that state accurately. | API joins for student/teacher/guardian/deleted actor; E2E response viewer identity assertions. | DONE |
| ISS3-026 | P0 | Forms gets separate **Forms** and **Responses** routes/tabs. Forms filters include category and every supported audience dimension (role, class, section, course/enrollment, specific person). Responses can be filtered by form, status/date, respondent role/person, class, section, and student/ward, and are grouped/paginated rather than embedded as an unstructured list in each form modal. | API filter/pagination/tenant-scope tests; E2E combined filters and deep links; responsive EN/UR screenshots. | DONE |
| ISS3-027 | P0 | Replace the Specific People checkbox wall with a staged audience picker: choose role (teacher/student/guardian), then narrow by class/section where applicable, then use an async searchable multi-select. It must handle hundreds of people, preserve selections while changing filters, show selected chips, and prevent duplicate recipients. | U/C picker state tests; API audience-resolution tests; E2E large fixture, keyboard, mobile, and mixed-role selection. | DONE |
| ISS3-028 | P0 | Add guardians as first-class Form audience recipients. Guardian visibility is derived through linked wards; response records retain both guardian respondent and ward context. Filtering responses by a student must include responses submitted by that student’s guardian without leaking siblings or other wards. | API many-to-many audience/response authorization tests; E2E guardian sees/submits and admin filters by ward. | DONE |
| ISS3-029 | P0 | Guardian portal navigation and dashboard expose applicable Announcements and Forms, including class/section/ward-targeted content. With multiple children, the selected child scopes the content and the UI identifies which child each item concerns. | API guardian-scope tests; E2E one- and multi-child journeys; dashboard/forms/announcements screenshots. | DONE |

### F. Assignments, attendance, uploads, and timetable

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-030 | P1 | Permit the supported **document** family for assignment/resource uploads, including PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP, TXT, CSV, RTF, and Markdown. Validate extension, detected MIME/signature, size, and malware policy; reject executables, scripts, HTML, disguised files, and unsafe archives rather than interpreting “all files” literally. | U/C allow/deny matrix; API content-sniffing tests; E2E `.md` plus Office/PDF upload/download. | DONE |
| ISS3-031 | P0 | Student My Assessments table/cards have explicit headers/labels (assignment, course, due date, instructions/status, submission/actions). Before the deadline, a student may remove or replace their own submission after confirmation; after the deadline the configured late-submission policy is enforced server-side. | API ownership/deadline/timezone tests; E2E submit → download → replace/remove before deadline and reject after deadline; desktop/mobile screenshots. | DONE |
| ISS3-032 | P0 | Multi-section assignment creation has one logical batch and exactly one applicable assignment per student/teacher context. Selecting two sections must not produce duplicate cards for the same learner; section copies retain batch identity for edit/delete/reporting. | PostgreSQL uniqueness/idempotency tests; E2E publish to two sections with overlapping fixtures and assert one item per learner. | DONE |
| ISS3-033 | P0 | Opening an unmarked attendance roster initializes every eligible student as **Present** in the UI. Only an explicit save persists marks; loading historical marks must never overwrite them with defaults, and unsaved navigation warns the user. | U/C initialization/dirty-state tests; API unchanged-before-save assertion; E2E open → exceptions → save/reopen. | DONE |
| ISS3-034 | P0 | Only a teacher assigned by timetable to the exact session/class/section/course may create or manage that assignment. Principal-created assignments automatically appear to the timetable teacher(s) for the same scope. Permission/delegation alone cannot bypass teaching scope except an explicit principal action. | API authorization matrix and timetable-change tests; E2E principal publish → assigned teacher sees/manages; unassigned teacher receives 403/no UI action. | DONE |
| ISS3-035 | P1 | My Timetable has explicit column headers/card labels for time, course, section/period, and teacher/location as applicable. Remove the redundant class column when the page is already class-scoped; show the class/section as a heading beneath **My timetable**. Multi-class users get a clear class switcher rather than ambiguous mixed rows. | U/C responsive table labels; E2E single/multi-class teacher/student at desktop/mobile EN/UR; screenshots. | DONE |

## Implementation order and dependency map

1. **Foundation (P0):** ISS3-001, 004–006, 019. These shared components and
   validation contracts must land before broad screen rewrites.
2. **Identity/admission domain:** ISS3-008, 009, 011, 012, then 007, 010,
   013–016. Database constraints and APIs precede builder/modal work.
3. **Messaging:** ISS3-018, then ISS3-020/021. All delivery uses the canonical
   phone contract from ISS3-019.
4. **Forms/guardian scope:** ISS3-025–029. Ward-aware authorization is required
   before exposing guardian routes or response filters.
5. **Teaching operations:** ISS3-032/034 before ISS3-031; ISS3-033 and ISS3-035
   can proceed independently after the shared UI foundation.
6. **Finance/reporting:** ISS3-022–024 after the shared Action menu and dialog
   primitives are stable.

## Issues 3 release gates

- [ ] Every ISS3 P0 item is DONE; no P0 requirement is waived by a UI-only fix.
- [ ] PostgreSQL migrations are reversible/tested on a populated legacy snapshot,
      including admission-number uniqueness, phone normalization, and guardian links.
- [ ] Full backend suite passes with tenant/RLS and non-owner database coverage.
- [ ] Frontend strict TypeScript build, i18n audit, endpoint contract, and the
      ratcheted unsafe-type gate pass.
- [ ] Principal, delegated teacher, assigned/unassigned teacher, student,
      independent student, one-child guardian, and multi-child guardian journeys pass.
- [ ] Action menus, dialogs, snackbars, phone inputs, tables/cards, and audience
      pickers pass keyboard and screen-reader-oriented component checks.
- [ ] Desktop (1440), tablet (768), and mobile (390) EN/UR screenshots are reviewed
      for every visible ISS3 item; there is no unintended page-level overflow.
- [ ] Evolution API QR, phone pairing, and credential delivery are verified without
      exposing tokens, phone secrets, API keys, or login links in logs/artifacts.
- [ ] Production build is proven to target the production API, migrations complete,
      `/readyz` passes, and smoke tests cover login plus the changed role journeys.
- [ ] Independent review reports no unresolved critical/high finding and the final
      evidence is linked from `IMPLEMENTED.md`.

## Current local evidence (2026-07-26)

These gates were re-run while advancing the Issues 3 backlog. Except where
explicitly called out as production smoke, they are current local evidence only;
they do not replace the release gates above for PostgreSQL legacy migration,
live Evolution API delivery, changed-role production journeys, or the full
role/language/screenshot matrix.

- **V26-LOCAL** — [2026-07-26 ISS3 evidence refresh](IMPLEMENTED.md#2026-07-26--iss3-evidence-refresh-action-menus-credentials-built-ins-and-gates).
- **B26-FULL** — backend `.venv/bin/python -m pytest`: **263 passed, 2 skipped**.
- **B26-CRED** — guardian credential delivery and phone-choice API tests passed,
  including rejection of unregistered selected numbers.
- **B26-PHONE** — phone value object and WhatsApp connection suites passed:
  **23 passed**.
- **BUILD26 / I18N26 / TYPE26** — production build passed; i18n audit passed
  with **1067 keys checked**; unsafe-type ratchet passed with baseline
  `any=135`, `as-any=1`, `ts-suppressions=0`.
- **UI26-FOUNDATION** — `test:foundation-components` and `test:action-menu`
  passed after opening row menus in People, Resources, and Holidays.
- **UI26-ISSUES** — `test:visual-issues` passed with refreshed
  `CURRENT-*` screenshots after the Admission built-in sections were aligned.
- **UI26-FOCUSED** — focused Playwright gates passed for students layout, phone
  inputs, WhatsApp connection, credential links, forms/responses, guardian
  dashboard, audience picker, salary history, finance profiles, report ranges,
  document uploads, attendance defaults, My Assessments, My Timetable,
  assignment batch, and admission builder.
- **PROD26-SMOKE** — GitHub commit
  `938eebc98da4d938928ab647657ac8b2a13e5f2c` is deployed in Coolify; public API
  `/readyz` returned 200 and browser login through
  `https://app-suffa.anas31.qzz.io/` reached `/dashboard` with no critical
  failed API responses. Screenshot: `/tmp/suffa-live-login-938eebc.png`.

## Previous verified reports (historical, 2026-07-22)

### Current report

| ID | Requirement | U/C | API | E2E | Shot | Done |
|---|---|---|---|---|---|---|
## 2026-08-09 - Results Workflow Follow-up

- Add a persistent principal review queue for teacher-submitted course results. Current implementation validates teacher scope and records an audit event, while the principal can publish class-wide results from the admin flow.
- Clean up existing TypeScript errors unrelated to the results drilldown, including shared primitive prop typing, people finance donor profile typing, my-assessments submission typing, and route search-param typing.

## 2026-08-09 - Assignment Attachments Follow-up

- No deferred backend work from the attachment change: assignments already persist one `attachment_key`, and the UI now supports upload, download, replace, and remove against that field.

## 2026-08-09 - Result Publish Guard Follow-up

- No deferred publish-guard work from this change: publishing is blocked server-side and in the admin UI until every configured course result component has a mark for each enrolled student in the class.

## 2026-08-09 - Single Filter Card Selection Follow-up

- Audit remaining portal routes for any future screens that have exactly one true selector filter; Marking and `/my-timetable` now use card selection instead of dropdown filters, and Results no longer uses a filter wrapper for drill-down navigation.

## 2026-08-09 - Teacher Assignment Review Follow-up

- No deferred submission-status work from this change: `/my-assessments` now opens a teacher review sheet with full roster, download buttons for submitted work, and `Not submitted` status for missing work. My Assignments filters are scoped to teacher timetable class-section-course pairs; sections unlock only after class selection.

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

### Issues.pdf regression set

| ID | Requirement | U/C | API | E2E | Shot | Done |
|---|---|---|---|---|---|---|
| PDF-01 | People navigation uses Applications terminology correctly | ✅ I18N | — | ✅ UI-CURRENT | ✅ current screens | ✅ V22 |
| PDF-02 | Teachers can submit forms addressed to everyone | — | ✅ B-SCOPE | ✅ UI-LIVE | ✅ `PDF-02*` | ✅ V22-LIVE |
| PDF-03 | Student modal shows username/class, no duplicate close/name, and entity edits | — | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-03*` | ✅ V22 |
| PDF-04 | Guardian rows have a View action | — | — | ✅ UI-CURRENT | ✅ `CURRENT-05*` | ✅ V22 |
| PDF-05 | A guardian can be linked to a student during creation | — | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-05*` | ✅ V22-LIVE |
| PDF-06 | Student/Donor detail views have no duplicate close/name controls | — | — | ✅ UI-CURRENT | ✅ student + donor list | ✅ V22 |
| PDF-07 | Modals have usable desktop and mobile widths | — | — | ✅ UI-CURRENT | ✅ desktop/mobile modal | ✅ V22 |
| PDF-08 | Destructive confirmation uses the application dialog, not browser alert | — | — | ✅ UI-LIVE | ✅ `PDF-08*` | ✅ V22-LIVE |
| PDF-09 | Closed Admission Forms can be deleted without losing applications | — | ✅ B-FULL | ✅ UI-FORM | — | ✅ V22 |
| PDF-10 | Inquiries spelling, form-type dialog, category/program filters are correct | ✅ I18N | ✅ B-FULL | ✅ UI-CURRENT | ✅ `CURRENT-07/08*` | ✅ V22 |
| PDF-11 | Edit works and configured English/Urdu madrasa name appears everywhere | ✅ I18N | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-11*` | ✅ V22-LIVE |
| PDF-12 | Grading configuration has an explicit working Save action | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-13 | Grading supports course defaults and optional class overrides | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-14 | Student result card downloads successfully | ✅ B-PDF | ✅ B-PDF | ✅ UI-LIVE | ✅ PDF page + `PDF-14*` | ✅ V22-LIVE |
| PDF-15 | PDFs are decorated and generated in the current user's language | ✅ B-PDF | ✅ B-PDF | ✅ PDF-RENDER | ✅ EN/UR pages | ✅ V22 |
| PDF-16 | Teachers upload resources for their timetable teaching scope | — | ✅ B-SCOPE | ✅ UI-LIVE | ✅ `PDF-16*` | ✅ V22-LIVE |
| PDF-17 | PWA header controls fit mobile widths | — | — | ✅ UI-AUDIT | ✅ mobile EN/UR | ✅ V22 |
| PDF-18 | Tables remain usable on mobile/PWA | — | — | ✅ UI-AUDIT | ✅ mobile EN/UR | ✅ V22 |
| PDF-19 | Granted teacher permissions are honoured | — | ✅ B-SCOPE | ✅ UI-CURRENT | ✅ `CURRENT-11*` | ✅ V22 |
| PDF-20 | Leave actions do not overlap | — | — | ✅ UI-AUDIT | ✅ leave mobile | ✅ V22 |
| PDF-21 | Form labels generate internal keys; field_key is not user-facing | ✅ UI-FORM | ✅ B-FULL | ✅ UI-FORM | ✅ builder modal | ✅ V22 |
| PDF-22 | Students can be explicitly assigned/unassigned to a class | — | ✅ B-ENROLL | ✅ UI-CURRENT | ✅ student modal | ✅ V22 |
| PDF-23 | Mutating actions show loading and prevent duplicate clicks | — | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-23*` | ✅ V22-LIVE |
| PDF-24 | All filterable screens use the dynamic inline filter | — | — | ✅ UI-AUDIT | ✅ filter screens | ✅ V22 |
| PDF-25 | No untranslated `searchBtn` key is rendered | ✅ I18N | — | ✅ UI-CURRENT | ✅ EN/UR screens | ✅ V22 |
| PDF-26 | Urdu text has correct spacing and does not overlap | ✅ I18N | — | ✅ UI-AUDIT | ✅ mobile Urdu | ✅ V22 |
| PDF-27 | Grading includes assignment pool weight and class upload limit | ✅ B-GRADE | ✅ B-GRADE | ✅ UI-CURRENT | ✅ `CURRENT-13*` | ✅ V22 |
| PDF-28 | Students can see results and assignment marks | ✅ B-FULL | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-14_PDF-28_PDF-30*` | ✅ V22-LIVE |
| PDF-29 | Teachers can add assignment remarks | — | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-29*` | ✅ V22-LIVE |
| PDF-30 | Submitted assignment remains downloadable and chooser is hidden afterward | — | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-14_PDF-28_PDF-30*` | ✅ V22-LIVE |
| PDF-31 | Student dashboard is complete and visually verified | — | ✅ B-FULL | ✅ UI-LIVE | ✅ `PDF-31*` | ✅ V22-LIVE |

### Previous release gates (2026-07-22 evidence only)

- [x] Alembic upgrades a populated PostgreSQL legacy database through both historical NOT NULL migrations; legacy `admission_forms.category` and `teacher_profiles.is_principal_delegate` rows were backfilled before `NOT NULL`, and the database reached `84d3b7e91a20`.
- [x] Full backend suite passes against PostgreSQL with tenant/RLS coverage.
- [x] Frontend TypeScript build and missing-i18n-key audit pass.
- [x] Principal, delegated-teacher, teacher, student, and guardian Playwright journeys pass against the isolated live API in EN/UR and desktop/mobile viewports.
- [x] Every required screenshot is reviewed. The complete `CURRENT-*`, remaining live `PDF-*`, and EN/UR PDF evidence is stored under `app/artifacts/issue-verification/`.
- [x] The deployed Compose stack starts backend, worker, app, and web; backend `/readyz`, app, and web health checks pass.
- [x] Code review reports no unresolved critical/high implementation finding.

### Evidence catalogue

- **V22** — [2026-07-22 verified current-issue implementation](IMPLEMENTED.md#2026-07-22--verified-current-01-through-20-implementation).
- **V22-LIVE** — [2026-07-22 live role and release qualification](IMPLEMENTED.md#2026-07-22--live-role-and-release-qualification).
- **B-FULL** — backend `pytest`: **179 passed, 2 skipped** on SQLite and **180 passed, 1 skipped** on PostgreSQL; the separate non-owner RLS integration passed.
- **B-DASH / B-DONOR / B-SCOPE / B-PDF** — focused tests in `test_current_portal_issues.py` and `test_reported_portal_issues.py`.
- **B-ADMIT / B-ATTEND / B-ENROLL / B-GRADE** — focused suites `test_admission_conversion.py`, `test_attendance_period_enrollment_history.py`, and `test_assessments_redesign.py`.
- **BUILD / I18N** — production Vite/TypeScript build and the 913-key static i18n audit.
- **UI-CURRENT** — `npm run test:visual-issues`; automated principal/delegated-teacher mocked-API UI journeys and named screenshots.
- **UI-FORM** — `npm run test:admission-builder`; create/edit/render/submit browser regression.
- **UI-AUDIT** — reviewed EN/UR desktop/mobile captures under `app/artifacts/ui-audit/final/`.
- **PDF-RENDER** — deterministic EN/UR report PDFs and page renders under `app/artifacts/issue-verification/`.
- **UI-LIVE** — `npm run test:live-seed` and `npm run test:live-roles`; actual API login, mutation, upload/download, and persisted-data journeys for all five portal roles against isolated PostgreSQL/Redis/MinIO services.

## 2026-08-09 - My Assessments Assignment Drilldown Follow-up

- Remaining: Browser-check the class -> section -> course -> assignments drilldown with a real teacher account after the running frontend picks up the latest source.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Assessment Drilldown Back Button Follow-up

- Remaining: Browser-check the Back button appearance in Examination and My Assessments on mobile once the running frontend refreshes.
- Release blocker: None for the code path; no touched-route TypeScript errors were reported.

## 2026-08-10 - Assessment Accordion Search Follow-up

- Remaining: Browser-check Marking, Results, and My Assessments with real teacher/admin accounts to confirm class accordion expansion, section selection, Back headers, and search filtering on mobile.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Published Results Exam Breakdown Follow-up

- Remaining: Browser-check `/results` for staff and student accounts to confirm spacing, no publish action, PDF export, and subject expansion showing every exam mark.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Academics Search and Section Count Follow-up

- Remaining: Browser-check Academics Programs, Classes, and Courses search plus class section counts after the running frontend reloads.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Session Switching Flow Follow-up

- Remaining: Browser-check profile session selection for principal, teacher, student, and guardian accounts, including old-session read-only viewing for attendance, assignments, timetable, and results.
- Remaining: Browser-check session activation/rollover on the running app to confirm open dashboards and self-service screens refresh to the new active session without manual logout.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Attendance Filters and Session Promotion Follow-up

- Remaining: Browser-check Attendance student mode and teacher mode filters on the running app, including small mobile widths.
- Remaining: Browser-check Academics session rollover with real seeded classes/sections to confirm class promotion mapping, section matching, copied timetable, copied holidays, and new active-session refresh.
- Release blocker: None for the code path; full TypeScript still has pre-existing unrelated errors in other routes/components.

## 2026-08-10 - Academic Session Editing and Deletion Follow-up

- Browser-check the edit sheet, delete confirmation, and API dependency messages on the Sessions tab.
- Keep deletion blocked for sessions with historical records so previous-session read-only access remains intact.

## 2026-08-10 - Archived Session Activation Follow-up

- Browser-check activating a previous session while the profile is viewing an archived session, then confirm the profile follows the newly active session.

## 2026-08-10 - Course Editing and Deletion Follow-up

- Browser-check the Courses tab edit sheet, duplicate-name validation, and deletion dependency message.

## 2026-08-10 - Attendance Filters and History Editing Follow-up

- Browser-check Students filters with dates containing present/absent/leave records and confirm class cards update correctly.
- Browser-check Teachers date filter and admin/principal correction controls for old student and teacher attendance records.

## 2026-08-10 - Attendance Date Range Follow-up

- Browser-check the Finance-style Attendance filter layout and From/To range behavior at mobile and desktop widths.

## 2026-08-10 - Class-First Attendance Navigation Follow-up

- Browser-check class accordion expansion and section selection on mobile and desktop, including filtered class and section searches.

## 2026-08-10 - Teacher Attendance Time Editing Follow-up

- Browser-check admin/principal edits to check-in and check-out values, including clearing a time and status corrections with changed times.

## 2026-08-10 - Collapsible Teacher Attendance Editing Follow-up

- Browser-check the teacher history accordion state and compact time formatting on mobile and desktop.

## 2026-08-10 - Teacher Log Toolbar Follow-up

- Browser-check Teacher log title/filter alignment and shared FilterBar title rendering at narrow mobile widths.

## 2026-08-10 - Automatic Teacher Absences Follow-up

- In a non-production session, browser-check the next-day absence job for a teacher with no check-in, an approved-leave teacher, and a madrasa-wide holiday.

## 2026-08-10 - Application-Based Student Creation Follow-up

- Browser-check application-form creation, file/image upload, manual student creation, and the recorded answers at mobile and desktop widths.
- Public admission pages do not yet support unauthenticated file/image uploads; keep those field types for staff-created applications until a token-scoped upload endpoint is introduced.

## 2026-08-10 - Dedicated Student Profile Route Follow-up

- Browser-check direct navigation, browser Back behavior, and student profile actions at mobile and desktop widths.

## 2026-08-10 - Optional Application Fields For Manual Students Follow-up

- Browser-check an unselected form, required custom form fields, and file/image custom fields during manual student creation.

## 2026-08-10 - Admissions Filters Follow-up

- Browser-check Applications and Application Forms filter-button interactions at mobile and desktop widths, including clear/reset behavior.

## 2026-08-10 - Student And Guardian Addresses Follow-up

- Browser-check dependent and independent New student form states, including inline guardian address creation.

## 2026-08-10 - Public Application Form Sharing Follow-up

- Browser-check Share on mobile and web, public form loading, default/custom fields, submission, and Applications-tab receipt.

## 2026-08-10 - Public Application Program Selection Follow-up

- Browser-check the required Program dropdown, dependent/independent field visibility, phone and B-Form/CNIC masks, and submission into Applications. Public file/image uploads remain deferred because the public route currently records submitted field values rather than creating authenticated file records.

## 2026-08-10 - Application Enrollment Without Placement Follow-up

- Browser-check dependent and independent applications enrolling through the single action, then placing the resulting student into a class later.

## 2026-08-10 - Complete Application Profiles Follow-up

- Browser-check public image/file upload, pending application profile rendering, enrollment photo attachment, and the enrolled student profile at mobile and desktop widths.

## 2026-08-10 - Default Contact Numbers And Guardian Accounts Follow-up

- Browser-check adding, removing, and selecting the default phone number for independent students, guardians, teachers, and donors; confirm WhatsApp credentials use the chosen default and an enrolled application guardian has a generated, disabled account.

## 2026-08-10 - Incomplete Profiles Follow-up

- Browser-check principal counts and drill-down filters, WhatsApp reminder delivery, and student/guardian My Profile editing for independent and dependent students at mobile and desktop widths.
