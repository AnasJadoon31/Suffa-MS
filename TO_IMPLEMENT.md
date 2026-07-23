# TO_IMPLEMENT — Active portal issue programme (2026-07-23)

This checklist is the source of truth for unresolved portal work. An item remains open
until its automated tests pass and, for visible behaviour, a role-specific screenshot is
reviewed. Previously verified July 22 items are retained below as historical evidence;
they do not close or weaken the new July 23 requirements.

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
| ISS3-001 | P0 | Create one reusable, accessible row **Action menu** component and replace multi-button action clusters project-wide (People, Applications, Admission Forms, Assessments, Forms, Finance, Salary, and any other table with more than one action). The trigger and menu must fit one row, support keyboard navigation/Escape/outside click, use translated labels, distinguish destructive actions, and remain usable on mobile cards. | U/C menu interaction and focus tests; E2E representative view/edit/delete/download flows on desktop/mobile EN/UR; reviewed screenshots of every migrated table family. | OPEN |
| ISS3-002 | P0 | Rebuild the People → Students header/filter/table layout. Filters and **Add student** stay in one intentional responsive toolbar; Portal/Status columns use content-sized widths; Actions never clip or wrap unpredictably; the table has no page-level horizontal overflow. | E2E at 1440, 768, and 390 px with 10+ rows; geometry assertions; EN/UR screenshots. | OPEN |
| ISS3-003 | P0 | Never render raw set-password/login URLs inline after creating or reissuing credentials. Show a compact success state with copy/send actions; long links must not expand the page. | U/C state test; E2E create/reissue at desktop/mobile; assert token/link text is absent from normal page content. | OPEN |
| ISS3-004 | P1 | Replace every remaining `window.alert`, `window.confirm`, and `window.prompt` with application-owned translated dialogs. Warnings show consequences; destructive confirmation names the target and blocks duplicate submission. | Static source gate plus U/C dialog tests; E2E representative destructive, warning, and text-input confirmations. | OPEN |
| ISS3-005 | P1 | Add one application-level snackbar/toast system for real-time notifications and mutation success/failure/pending status. It must queue rather than overwrite messages, be screen-reader announced, translated, dismissible, and must not replace blocking confirmation dialogs. | U/C queue/timer/ARIA tests; E2E success, API error, offline, and background notification cases. | OPEN |
| ISS3-006 | P0 | Establish project-wide type safety and boundary validation: no new untyped API payloads or rendered error objects; shared request/response types; Pydantic validation for identifiers, dates, phone numbers, money, enums, and cross-field rules; frontend forms show field-specific translated errors. Ratchet—not blanket-disable—existing `any` usage and add CI gates. | TypeScript strict build; typed endpoint contract; schema/API negative tests; static `any`/unsafe-cast baseline that may only decrease; E2E 422 rendering. | OPEN |

### B. Students, guardians, admissions, and identity

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-007 | P0 | Student edit must include the complete stored admission information (selected form, program, submitted answers, identity, medical/prior-school data, guardian data where applicable), with permission and active-session enforcement. Editing must preserve fields not present in the chosen template. | API read/update/authorization tests; E2E edit/reopen persistence with custom admission fields; modal screenshots. | OPEN |
| ISS3-008 | P0 | Admission numbers are server-generated, tenant-unique, immutable identifiers. Remove editable admission-number inputs from create, edit, application acceptance, imports, and normal APIs. Concurrent creation must not collide; legacy values remain readable. | PostgreSQL concurrency/uniqueness tests; API rejection of client-supplied changes; E2E create/edit assertions. | OPEN |
| ISS3-009 | P0 | Usernames are proposed automatically from the person’s normalized name using a deterministic tenant-unique suffix strategy for collisions. The proposal is visible and editable before account creation; final uniqueness is enforced atomically server-side for teacher, student, guardian, and principal-managed provisioning. | U/C normalization cases (Urdu, punctuation, duplicate names); PostgreSQL concurrency tests; E2E preview/edit/create. | OPEN |
| ISS3-010 | P0 | **Submit application** starts by choosing an Admission Form. The selected form drives program/defaults, required system sections, and custom questions; submission without a form is impossible. Closed forms may be viewed historically but cannot receive new applications. | API form binding/closed-form tests; E2E choose-form-first, validation, and persisted-answer journey. | OPEN |
| ISS3-011 | P0 | Guardian handling in application/student creation explicitly supports **Link existing**, **Create new**, and **Independent student**. Existing guardians use an async searchable multi-select rather than a checkbox wall; duplicate CNIC/phone matches are surfaced before creating another record. | API duplicate/link/tenant-scope tests; E2E search, select multiple, create new, and independent paths at scale (100+ guardians). | OPEN |
| ISS3-012 | P0 | A student may have zero, one, or multiple guardians, and a guardian may have multiple wards. Linking/unlinking is idempotent and tenant-safe; role/relationship and portal access are stored per guardian/link where appropriate. Correct the existing “multiple guardians assigned to single guardian” ambiguity to this many-to-many contract. | Database constraint/migration tests; API authorization/idempotency tests; E2E both relationship directions and guardian child switcher. | OPEN |
| ISS3-013 | P0 | Applications cannot be submitted, accepted, converted, or otherwise mutated while an archived academic session is selected. Acceptance always targets the active session unless an explicitly authorized migration workflow is later designed. UI hides/disables controls and the API rejects bypasses. | API archived-session mutation tests; E2E session switch and disabled controls; no mutation request emitted. | OPEN |
| ISS3-014 | P0 | Application submission/acceptance exposes explicit portal decisions for the student and every guardian: enabled/disabled, account username proposal, and delivery target. Independent students require their own contact details; disabling a portal must prevent credential issuance. | API provisioning matrix; E2E student-only, guardian-only, both, and neither; audit-log assertions. | OPEN |
| ISS3-015 | P1 | Student profiles support an optional normalized phone number independently of guardian contact data. Independent status must be visible in detail/edit views and must not fabricate a guardian relationship. | Schema/API tests; E2E independent student create/edit/view; reports/exports retain the phone safely. | OPEN |
| ISS3-016 | P0 | General admission forms include configurable **Student** and repeatable **Guardian** system sections. Admins may enable/disable system fields without deleting their definitions; `+ Add guardian` supports multiple guardians. Acceptance atomically creates/links the student and all declared guardians, while allowing a valid no-guardian/independent submission. | Builder U/C tests; API schema/versioning and atomic conversion rollback tests; E2E build → submit → accept → verify links. | OPEN |
| ISS3-017 | P2 | Rename “General public form” to **General form** everywhere. “Public” describes distribution, not the form’s data model; the same form can be used internally by Add Student and externally by link. | I18N/static key audit and EN/UR chooser screenshots. | OPEN |

### C. Phone numbers, WhatsApp, and credential delivery

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-018 | P0 | WhatsApp Settings offers both **QR code** and **phone-number pairing** in one coherent connection flow. Switching methods invalidates/replaces only an incomplete pairing after confirmation; connected sessions cannot be accidentally replaced. Status polling and recovery work for both methods. | Evolution API contract tests using the required skill/runbook; E2E QR and pairing-code state machines; desktop/mobile screenshots. | OPEN |
| ISS3-019 | P0 | Introduce one shared Pakistan phone-number value object/input used everywhere. The visible input has a fixed `+92` prefix; accept common local input such as `03…`, normalize storage/delivery to E.164 `+923…`, reject invalid lengths/prefixes, and never double-prefix. Existing valid records require a data migration/backfill report. | Property/unit normalization tests; migration dry-run/integration tests; API negative tests; E2E all person/application/settings forms. | OPEN |
| ISS3-020 | P1 | Add a `phone` custom-field type to the form builder. It uses the shared phone component/validation, persists a normalized value, renders correctly on public/internal forms, and exports/displays in a human-readable form. | Builder/schema/API tests; E2E create → submit → edit/view → export in EN/UR. | OPEN |
| ISS3-021 | P0 | Send new/reissued login links through Evolution API from the application. The admin chooses an eligible student/guardian/teacher phone when more than one exists, sees delivery progress/result, can retry safely, and receives a copy fallback only when delivery genuinely fails. Tokens and full links must not enter logs or page text. | Evolution API request/idempotency tests; API authorization/audit tests; E2E send/success/failure/retry; secret-redaction log assertion. | OPEN |

### D. Finance, salary, and reports

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-022 | P1 | Clicking a student/payer/donor identity in Finance opens a structured profile modal with contact/profile data and the person’s complete contribution/donation/payment history. Rows remain keyboard accessible; receipt actions remain in the Action menu; tenant permissions prevent cross-person/cross-tenant access. | API person-history tests; E2E keyboard/click/modal/history journey; desktop/mobile screenshots. | OPEN |
| ISS3-023 | P0 | Redesign Salary as a salary-history screen. The default view is a table of recent salary records/payments with teacher, amount, effective/paid date, period, method, and status. A primary **Record salary** action opens a teacher-search/select modal; row Action menus provide view/edit/delete with audit and active-session rules. Empty/loading/error states must not collapse into a tiny selector. | API CRUD/history/permission/audit tests; E2E record/edit/delete/filter journey; responsive screenshots with many rows. | OPEN |
| ISS3-024 | P1 | Reports date filters provide quick ranges: **1 week, 1 month, 3 months, 6 months, 1 year**. A quick range sets exact From/To dates in the madrasa timezone, remains editable, indicates the active preset, and is shared by all applicable reports. | U/C boundary/leap-year/timezone tests; E2E preset selection and generated-report query assertions. | OPEN |

### E. Forms and responses

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-025 | P0 | Form responses must resolve and display the real respondent and relevant student/ward; valid linked records must never appear as “Unknown person.” Preserve a historical fallback only for genuinely deleted/unresolvable actors and label that state accurately. | API joins for student/teacher/guardian/deleted actor; E2E response viewer identity assertions. | OPEN |
| ISS3-026 | P0 | Forms gets separate **Forms** and **Responses** routes/tabs. Forms filters include category and every supported audience dimension (role, class, section, course/enrollment, specific person). Responses can be filtered by form, status/date, respondent role/person, class, section, and student/ward, and are grouped/paginated rather than embedded as an unstructured list in each form modal. | API filter/pagination/tenant-scope tests; E2E combined filters and deep links; responsive EN/UR screenshots. | OPEN |
| ISS3-027 | P0 | Replace the Specific People checkbox wall with a staged audience picker: choose role (teacher/student/guardian), then narrow by class/section where applicable, then use an async searchable multi-select. It must handle hundreds of people, preserve selections while changing filters, show selected chips, and prevent duplicate recipients. | U/C picker state tests; API audience-resolution tests; E2E large fixture, keyboard, mobile, and mixed-role selection. | OPEN |
| ISS3-028 | P0 | Add guardians as first-class Form audience recipients. Guardian visibility is derived through linked wards; response records retain both guardian respondent and ward context. Filtering responses by a student must include responses submitted by that student’s guardian without leaking siblings or other wards. | API many-to-many audience/response authorization tests; E2E guardian sees/submits and admin filters by ward. | OPEN |
| ISS3-029 | P0 | Guardian portal navigation and dashboard expose applicable Announcements and Forms, including class/section/ward-targeted content. With multiple children, the selected child scopes the content and the UI identifies which child each item concerns. | API guardian-scope tests; E2E one- and multi-child journeys; dashboard/forms/announcements screenshots. | OPEN |

### F. Assignments, attendance, uploads, and timetable

| ID | Pri | Requirement and acceptance criteria | Required verification | Status |
|---|---:|---|---|---|
| ISS3-030 | P1 | Permit the supported **document** family for assignment/resource uploads, including PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP, TXT, CSV, RTF, and Markdown. Validate extension, detected MIME/signature, size, and malware policy; reject executables, scripts, HTML, disguised files, and unsafe archives rather than interpreting “all files” literally. | U/C allow/deny matrix; API content-sniffing tests; E2E `.md` plus Office/PDF upload/download. | OPEN |
| ISS3-031 | P0 | Student My Assessments table/cards have explicit headers/labels (assignment, course, due date, instructions/status, submission/actions). Before the deadline, a student may remove or replace their own submission after confirmation; after the deadline the configured late-submission policy is enforced server-side. | API ownership/deadline/timezone tests; E2E submit → download → replace/remove before deadline and reject after deadline; desktop/mobile screenshots. | OPEN |
| ISS3-032 | P0 | Multi-section assignment creation has one logical batch and exactly one applicable assignment per student/teacher context. Selecting two sections must not produce duplicate cards for the same learner; section copies retain batch identity for edit/delete/reporting. | PostgreSQL uniqueness/idempotency tests; E2E publish to two sections with overlapping fixtures and assert one item per learner. | OPEN |
| ISS3-033 | P0 | Opening an unmarked attendance roster initializes every eligible student as **Present** in the UI. Only an explicit save persists marks; loading historical marks must never overwrite them with defaults, and unsaved navigation warns the user. | U/C initialization/dirty-state tests; API unchanged-before-save assertion; E2E open → exceptions → save/reopen. | OPEN |
| ISS3-034 | P0 | Only a teacher assigned by timetable to the exact session/class/section/course may create or manage that assignment. Principal-created assignments automatically appear to the timetable teacher(s) for the same scope. Permission/delegation alone cannot bypass teaching scope except an explicit principal action. | API authorization matrix and timetable-change tests; E2E principal publish → assigned teacher sees/manages; unassigned teacher receives 403/no UI action. | OPEN |
| ISS3-035 | P1 | My Timetable has explicit column headers/card labels for time, course, section/period, and teacher/location as applicable. Remove the redundant class column when the page is already class-scoped; show the class/section as a heading beneath **My timetable**. Multi-class users get a clear class switcher rather than ambiguous mixed rows. | U/C responsive table labels; E2E single/multi-class teacher/student at desktop/mobile EN/UR; screenshots. | OPEN |

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

## Previous verified reports (historical, 2026-07-22)

### Current report

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
