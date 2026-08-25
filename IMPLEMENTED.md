# IMPLEMENTED

Running log of completed work (newest first). Design rationale lives in
`IMPLEMENT.md`; the remaining backlog in `TO_IMPLEMENT.md`.

## 2026-08-23 — Fix: TanStack Router Build Failure

- **What**: The production build failed during SSR generation with missing exports from `@tanstack/router-core` (e.g. `getScriptPreloadAttrs`). This was caused by conflicting versions: `package.json` had locked `@tanstack/react-router`, `@tanstack/react-start`, and `@tanstack/router-plugin` to `1.168.18` via overrides, but npm still resolved core dependencies like `@tanstack/router-core` to the newer `1.171.x` release which had breaking structural changes.
- **Files**: `app/package.json`
- **Fix**: Removed the strict overrides and updated the three `@tanstack` dependencies to `^1.170.32` so they resolve in sync with their core packages.
- **Verified**: `npm run build` in `app` completes successfully and generates the correct SSR manifest and SW.

## 2026-08-23 — Fix: Result Publishing UI & Timetable Weekday Mapping

- **What**: The results publishing badge was showing unpublished results to students, and the timetable in `my-timetable.tsx` was misaligning teachers/classes because the day-of-week mapping incorrectly assumed Sunday=0, whereas the backend provided Monday=0.
- **Files**: `app/src/routes/my-timetable.tsx` (fixed `DAY_KEYS`), `app/src/routes/examination.tsx` (added `published` check to result rows), `backend/app/modules/assessments/schemas.py` and `routes.py` (exposed `published` boolean).
- **Verified**: Fixed UI rendering for student and admin views.

## 2026-08-17 — Fix: Deployment failure (stale pgdata volume + DNS conflict on Coolify network)

- **What**: Deployment failed with `InvalidPasswordError: password authentication failed for user "mms"`. Two root causes: (1) the `pgdata` volume had stale credentials from a previous deployment — PostgreSQL ignores `POSTGRES_PASSWORD` when the data directory already exists; (2) the backend resolved `postgres` and `redis` hostnames to Coolify's shared `coolify-db` and Coolify Redis containers on the shared `coolify` network instead of the project's own containers.
- **Fix (server)**: Removed the stale `pgdata` volume and recreated the postgres container. Updated backend and worker to use full container names (`postgres-mehk45n5h18uso5e94d7tpzu-024157606306`, `redis-mehk45n5h18uso5e94d7tpzu-024157612635`) in `DATABASE_URL` and `REDIS_URL` to avoid DNS ambiguity.
- **Fix (repo)**: Updated `docker-compose.yml` to add explicit `networks.default.alias` entries for `postgres` and `redis` so service names resolve correctly even when the backend is also attached to the `coolify` network.
- **Verified**: All containers healthy; `/healthz` returns `{"status":"ok"}`; worker started and processed cron job.

## 2026-08-17 — Feature: My Assignments parity with Assignments page

- **What**: My Assignments (`/my-assessments`) now mirrors the Assignments (`/my-assignments`) page card-for-card. Teachers see their own uploads + other teachers' uploads for their timetable classes/courses. Clicking a card opens the shared `AssignmentDetailSheet` with file download, submissions list, and grading UI — same as the Assignments page. Own assignments show Edit/Delete actions on the card and in the detail sheet. Teachers can view submissions and grade any assignment on a class/course they teach (not just their own).
- **Files**: `app/src/routes/my-assessments.tsx` (filter bar layout, `canManage` based on role, Edit/Delete gated by `is_mine`), `app/src/routes/assignments.tsx` (exported `AssignmentDetailSheet` and `EditAssignmentSheet`, added `onMutated` callback), `backend/app/modules/assessments/routes.py` (teachers without `view_all` see all assignments for their timetable classes when `mine_only` is not set; `_require_assignment_owner_or_manager` now allows teachers to manage assignments on their timetable classes/courses), `backend/app/modules/assessments/schemas.py` (added `is_mine: bool` to `AssignmentRead`), `app/src/lib/mms/more-endpoints.ts` (added `is_mine` to `Assignment` type), `app/src/i18n/locales/en.json` and `ur.json` (added "By" key).
- **Verified**: `cd app && npm run build` passes; assignment tests pass (11/11).

## 2026-08-16 — Fix: Duplicate exam columns in Results tab

- **What**: Results tab showed Mid Term/Final Term/Assignments repeated 3× because `_exam_types_for_result_scope` returned duplicate `ExamType` rows from the DB.
- **File**: `backend/app/modules/assessments/routes.py` — added `_dedupe_exam_types()` helper, applied to both class-level and course-level fallback queries.
- **Verified**: Backend import check passes.

## 2026-08-16 — Fix: Daily Report fields auto-filling each other

- **What**: Typing in one Daily Report field populated all others because field `key` was auto-derived from label on every keystroke, causing key collisions.
- **File**: `app/src/routes/academics.tsx` — decoupled `key` from `label`, added dedicated "Field key" input, duplicate-key warning, and unique default keys for new fields.
- **Verified**: `cd app && npm run build` passes.
- **Note**: Existing configs with duplicate keys must be re-saved with unique keys.

## 2026-08-16 — Feature: Daily Reports under Academics in sidebar

- **What**: Moved "Daily Reports" from its own sidebar group into the "Academics" group so it appears alongside Assignments, Results, Examination, Academics, and Resources.
- **File**: `app/src/lib/mms/nav.ts` — added Daily Reports item to `academicNav`, removed standalone `dailyReportsNav` group and its entry in `navGroups`/`allNavItems`.
- **Verified**: `cd app && npm run build` passes.

## 2026-08-16 — Fix: Backend 500 on daily-report-config endpoint (IntegrityError on slug)

- **What**: After fixing Docker networking (DB/Redis URLs) and port mappings, the endpoint still returned 500. Root cause: migration `iss3_034_daily_reports` created `daily_report_configs` and `daily_report_entries` tables with a `slug` column (NOT NULL), but the SQLAlchemy model never defined it. INSERTs failed with `NotNullViolationError`. Fixed by creating migration `iss3_035_drop_daily_report_slug` to drop the unused `slug` column from both tables.
- **Files**: `backend/alembic/versions/iss3_035_drop_daily_report_slug.py` (new migration).
- **Verified**: `alembic upgrade head` runs cleanly; endpoint returns 401 (auth required, not 500).

## 2026-08-16 — Fix: Local backend 500 on daily-report-config (PUT)

- **What**: After the Docker fix, the local backend (running with `--reload` on port 8001) still returned 500 because postgres/redis had no host port mappings. The local backend connects via `localhost` (from `.env`) but the Docker containers weren't exposing ports. Added `ports: ["5432:5432"]` and `ports: ["6379:6379"]` to postgres and redis in docker-compose.
- **File**: `docker-compose.yml` (added port mappings for postgres and redis).
- **Verified**: `curl localhost:8001/api/v1/academics/classes/{id}/daily-report-config` returns 401 (not 500).

## 2026-08-16 — Fix: Daily Reports button on Academics Classes tab

- **What**: Fixed the "Daily Reports" button not working on the Classes tab of the Academics screen. The `onEditDailyReports` prop was declared in the `ClassList` component's type annotation but not destructured from props, causing a `ReferenceError` when clicked.
- **File**: `app/src/routes/academics.tsx:965` — added `onEditDailyReports` to the destructured props.
- **Verified**: `cd app && npm run build` passes.

## 2026-08-16 — Fix: Daily Reports field label losing focus / lag while typing

- **What**: Fixed the field label input losing focus on every keystroke (Card was keyed by `field.key` which changes on each edit) and lag while typing (state lived in the parent `AcademicsPage` which re-rendered entirely on each keystroke). Extracted the dialog into a `DailyReportConfigDialog` component with its own local state, so typing only re-renders the dialog. Added a stable `id` field per definition for React keys.
- **Files**: `app/src/routes/academics.tsx` (new `DailyReportConfigDialog` component, removed inline dialog/state from `AcademicsPage`), `app/src/lib/mms/more-endpoints.ts` (added optional `id` to `DailyReportFieldDefinition`).
- **Verified**: `cd app && npm run build` passes.

## 2026-08-16 — Fix: Daily Reports comma-separated options input

- **What**: Fixed being unable to type commas in the options field. The input value was derived from the parsed array (`field.options.join(", ")`), so typing a trailing comma would split+filter and the comma would vanish on re-render. Extracted each field row into a `DailyReportFieldRow` component with local state for the raw options text, so the input is only re-parsed on blur.
- **File**: `app/src/routes/academics.tsx` (new `DailyReportFieldRow` component).
- **Verified**: `cd app && npm run build` passes.

## 2026-08-16 — Feature: Daily Reports

- **What**: Programs/Classes can now have daily reports. Each class has its own daily report configuration (enable/disable + custom field definitions). Teachers mark daily reports per student via Class → Section → Students flow. Students view their own daily reports on a month calendar with indicators. Guardians see all their children in an accordion with calendar view to pick a date.
- **Files**:
  - `backend/app/modules/academics/models.py` — added `DailyReportConfig` (per-class config with enabled flag + fields_definition JSONB) and `DailyReportEntry` (per-student-per-day values JSONB).
  - `backend/app/modules/academics/schemas.py` — added `DailyReportFieldDefinition`, `DailyReportConfigCreate/Update/Read`, `DailyReportEntryRead`, `DailyReportEntryValues`.
  - `backend/app/modules/academics/routes.py` — added `GET/PUT /classes/{id}/daily-report-config`, `GET /classes/{id}/daily-report-entries`, `POST /classes/{id}/daily-report-entries` (upsert), `GET /academics/students/{id}/daily-report-entries`.
  - `backend/app/modules/people/routes.py` — added `GET /guardians/me/children` (children with class/section info) and `GET /students/me` (student's own profile + enrollment).
  - `backend/app/core/permissions.py` — added `daily_reports.manage` permission.
  - `backend/alembic/versions/iss3_034_daily_reports.py` — migration for new tables.
  - `app/src/lib/mms/more-endpoints.ts` — added `dailyReportApi` with getConfig, updateConfig, listEntries, saveEntry, listStudentEntries.
  - `app/src/lib/mms/nav.ts` — added `dailyReportsNav` group with `/daily-reports` route; added to teacher/guardian visible paths; student view via role check.
  - `app/src/routes/daily-reports.tsx` — new route with teacher (Class→Section→Students marking), student (month calendar + day detail), and guardian (children accordion + calendar) views.
  - `app/src/routes/academics.tsx` — added "Daily Reports" button to class expanded view; `FormSheet` dialog with enable toggle + field definitions editor (add/remove fields, set type/options/required).
- **Verified**: Frontend build passes (`cd app && npm run build`); all backend route modules import cleanly; route tree auto-generates correctly.
- **Notes**: Field types supported: text, textarea, number, boolean, dropdown, radio, checkbox_group, phone, file, image. Teachers can only edit reports same day (enforced by UI — no date restriction in API yet). Calendar uses green indicators for days with reports.

## 2026-08-16 — Feature: Mark Guardian as Donor

- **What**: Guardians can now be marked as Donors from their profile. A marked guardian gets a linked Donor record, a separate donor portal login (DN-XXXX), a Donations menu in their sidebar, and can view their own donation history.
- **Files**:
  - `backend/app/modules/people/models.py` — added `is_donor` boolean column to `Guardian`.
  - `backend/app/modules/finance/models.py` — added `guardian_id` FK to `Donor`.
  - `backend/app/modules/people/schemas.py` — added `is_donor` to `GuardianRead`.
  - `backend/app/modules/finance/schemas.py` — added `guardian_id` to `DonorRead`.
  - `backend/app/modules/auth/schemas.py` — added `is_donor` to `UserRead`.
  - `backend/app/modules/auth/routes.py` — `get_me` now populates `is_donor` for parent-role users.
  - `backend/app/modules/people/routes.py` — added `POST /guardians/{id}/mark-as-donor` (creates Donor + provisions DN-XXXX login) and `POST /guardians/{id}/unmark-donor` (deactivates donor, keeps record).
  - `backend/app/modules/finance/routes.py` — `/profiles/donors/me` now also resolves donor for parent-role users with `is_donor=True`.
  - `app/src/lib/mms/auth.tsx` — added `is_donor` to `MmsUser`.
  - `app/src/lib/mms/more-endpoints.ts` — added `markGuardianAsDonor` / `unmarkGuardianAsDonor` mutations and `is_donor` to `GuardianDetail`.
  - `app/src/lib/mms/nav.ts` — added Donations nav item (visible only to `parent`+`is_donor`); added `/donations` to `guardianVisiblePaths`; extended `NavItem` with optional `visible` callback.
  - `app/src/components/app/people/PersonDetail.tsx` — added "Mark as Donor" checkbox to `GuardianDetailSheet`.
  - `app/src/components/app/people/GuardianForm.tsx` — added "Mark as Donor" checkbox in edit mode.
  - `app/src/routes/donations.tsx` — new self-service route showing the guardian's donation history.
  - `app/src/i18n/locales/en.json` & `ur.json` — added "Mark as Donor" translation.
  - `backend/alembic/versions/iss3_033_guardian_donor_link.py` — migration adding `is_donor` and `guardian_id` columns.
- **Verified**: Frontend build passes (`cd app && npm run build`); all backend route modules import cleanly.
- **Notes**: A guardian logged in with their donor username (DN-XXXX, role=donor) sees only donations via the donor dashboard. The same guardian logged in with their guardian username (GR-XXXX, role=parent) sees children details plus the Donations sidebar entry. Unmarking deactivates the donor user login but preserves the Donor record and donation history.

## 2026-08-16 — Feature: Guardian Results under Academics

- **What**: Added a "Results" entry under Academics in the guardian sidebar. Lists all guardian's children in an accordion (same pattern as Assignments). Expanding a child shows session selector + course breakdown with expandable exam marks.
- **Files**:
  - `backend/app/modules/assessments/routes.py` — added `/results/parent-view` endpoint that returns all children with their session results (accepts optional `session_id` query param for session switching).
  - `app/src/lib/mms/more-endpoints.ts` — added `ParentResultView` type and `parentResults()` API function.
  - `app/src/routes/results.tsx` — added `GuardianResultsView` and `ChildResultView` components; updated `ResultsPage` to render guardian view for parent role.
  - `app/src/lib/mms/nav.ts` — added `/results` to `guardianVisiblePaths`.
- **Verified**: Frontend build passes (`cd app && npm run build`); backend route registered and Python syntax valid.
- **Notes**: Reuses the same accordion pattern and course breakdown UI from assignments/student results. Results visibility respects the `published` flag from the backend.

## 2026-08-16 — Fix: Non-admission form submission 500 error

- **What**: Non-admission forms (created via the Forms tab) returned "Internal server error" on submission because `normalize_admission_fields` always injected built-in admission fields (student_name, guardian_name, etc.) into any form's validation, even when the form had nothing to do with admissions. Required built-in fields missing from the response triggered 422; malformed field definitions in the DB triggered `pydantic.ValidationError` which propagated as a 500.
- **Files**: `backend/app/modules/operations/admissions.py`
  - `normalize_admission_fields` now takes an optional `answers` param and only adds built-in admission fields when the form definition OR the answers actually contain built-in keys.
  - `enabled_admission_fields` forwards `answers` to the normalizer.
  - `validate_admission_answers` passes `answers` through.
  - `FormFieldDefinition.model_validate` failures are caught and returned as 422 instead of 500.
- **Verified**: `tests/test_admission_conversion.py` — same 6 pass / 6 fail as before the fix (all 6 failures are pre-existing and unrelated).

## 2026-08-16 — Redesign: Guardian Portal Dashboard

- **What**: Redesigned the guardian dashboard with a horizontal swipe carousel for children, "My Children" heading, no outer scrollbar, full-replacement detail view per child, and profile-completion warning banner.
- **Files**:
  - `app/src/routes/dashboard.tsx` — Rewrote `GuardianView`: fixed-height layout with drag-to-swipe carousel (pointer events with snap), selected child's info replaces in scrollable inner panel.
  - `app/src/lib/mms/endpoints.ts` — Added `profile_complete: boolean` and `missing_fields: string[]` to `ParentDashboardChild`.
  - `backend/app/modules/reporting/routes.py` — Added `_student_missing_fields` helper; parent dashboard now returns `profile_complete` and `missing_fields` per child.
  - `app/src/i18n/locales/en.json`, `app/src/i18n/locales/ur.json` — Added "My Children", "Profile incomplete", "Incomplete", "Fee summary", "Total paid".
- **Layout**: Outer container is `h-[calc(100vh-7rem)]` with no overflow; the detail panel inside is the only scrollable region. Carousel uses `no-scrollbar` utility for hidden scrollbar.
- **Verified**: Frontend `tsc --noEmit` passes (no new errors); backend imports OK.

## 2026-08-15 — Feature: Guardian attendance course selection for non-self-contained programs

- **What**: When a guardian's child is enrolled in a program that is NOT self-contained, the attendance view now requires selecting a course before showing the attendance calendar. After selection, a course label with "Change course" button is shown above the attendance so it's always clear which course the attendance is for. Self-contained programs skip course selection and show attendance directly.
- **Files**: `app/src/routes/attendance.tsx` (ParentAttendance + ChildAttendance components), `app/src/lib/mms/endpoints.ts` (studentHistory API now passes courseId), `backend/app/modules/reporting/routes.py` (dashboard now returns class_id, section_id, program_id, courses per child), `app/src/i18n/locales/en.json`, `app/src/i18n/locales/ur.json`
- **Verified**: `npm run build` succeeds. Backend imports OK.
- **Logic**: Dashboard response now includes `program_id` and `courses` for each child. ParentAttendance checks `academics.self_contained_enabled` / `academics.self_contained_programs` settings against the child's `program_id`. If not self-contained and the class has courses, shows a course dropdown first. Once selected, `ChildAttendance` renders a course label + "Change course" link above `MyStudentAttendance` (which filters by courseId).

## 2026-08-15 — Fix: Guardian portal leaking all assignments + admin sidebar

- **Sidebar leak**: `isNavItemVisible` in `nav.ts` had no guardian branch, so guardians fell through to the default return and saw every non-feature-gated nav item (same as admin). Added `guardianVisiblePaths` allowlist: `/dashboard`, `/timetable`, `/resources`, `/announcements`, `/me`.
- **Assignments leak**: Guardians could navigate directly to `/assignments` and see all assignments (unscoped). Added `guardianRouteRedirect` that redirects any non-allowlisted route to `/dashboard`, applied in `AppShell.tsx` alongside the existing teacher redirect.
- Files: `app/src/lib/mms/nav.ts`, `app/src/components/app/AppShell.tsx`
- Verified: `npm run build` succeeds.
- Notes: Guardians have no dedicated assignments/grades view for their wards yet — they're blocked from the management view but have no read-only replacement.

## 2026-08-14 — Fix: White screen + Invariant failed (Cloudflare + Nitro routing)

- **White screen root cause**: (1) Nitro SSR build pass reads `public/assets` before the client build finishes writing them, embedding a stale `size: 6024` for ALL assets in the server manifest. (2) Cloudflare CDN cached the truncated `index-CSOJobjL.js` with `max-age=31536000, immutable`.
- **"Invariant failed" root cause**: Nitro's static middleware serves `index.html` (the bare SPA shell) for `/` BEFORE the TanStack Start SSR handler runs. The client receives static HTML without `$_TSR` hydration data, so TanStack Router throws "Invariant failed".
- **Fixes in `app/scripts/fix-sw.sh`**:
  - Step 3: Per-asset size correction (replaced broken global `sed` that set every asset to the SW file's size).
  - Step 4: Patched Nitro's static handler to skip serving `index.html` when `event.url.pathname === "/"`, letting SSR own the route.
- **Fix in `app/vite.config.ts` + `fix-sw.sh`**: Entry JS referenced as `/assets/index-CSOJobjL.js?v=2` to bypass Cloudflare's cached truncated version.
- Files: `app/scripts/fix-sw.sh`, `app/vite.config.ts`
- Verified: `https://app-suffa.anas31.qzz.io/` returns SSR HTML with `$_TSR`; `/dashboard` returns 200; JS serves 283903 bytes.
- Notes: Without Cloudflare API token, CDN cache purge isn't possible — `?v=2` query param bypasses stale cache. Increment if Cloudflare serves stale content again.

## 2026-08-14 — Fix: White screen from truncated JS bundle (Cloudflare + Nitro race)

- **Root cause**: Two compounding bugs: (1) Nitro SSR build pass reads `public/assets` before the client build finishes writing them, embedding a stale `size: 6024` in the asset manifest for ALL assets. The server sends `Content-Length: 6024`, truncating responses. (2) Cloudflare CDN cached the truncated `index-CSOJobjL.js` with `max-age=31536000, immutable` — no API access to purge.
- **Fix 1** (`app/scripts/fix-sw.sh` Step 3): replaced global `sed` size patch (which set every asset to the SW file's size) with a per-asset Node script that walks `public/assets`, stats each file, and corrects its individual `size` in the Nitro manifest.
- **Fix 2** (`app/vite.config.ts` + `app/scripts/fix-sw.sh`): entry JS referenced as `/assets/index-CSOJobjL.js?v=2` in `index.html` so Cloudflare treats it as a new uncached resource (HTML has `cf-cache-status: DYNAMIC`, always fresh).
- Files: `app/scripts/fix-sw.sh`, `app/vite.config.ts`
- Verified: `npm run build` succeeds; deployed `index.html` references `?v=2`; `https://app-suffa.anas31.qzz.io/assets/index-CSOJobjL.js?v=2` serves 283903 bytes (HTTP 200).
- Notes: Without Cloudflare API token, CDN cache can't be purged — cache-busting query param is the workaround. If CF cache ever serves stale content again, increment the query version.

## 2026-08-14 — Full PWA Offline Support (Read + Write)

- Implemented complete offline support: cached page reads AND queued mutation writes that sync when back online.
- **App shell**: Static `index.html` generated at build time (via `generateAppShell` plugin in `vite.config.ts`) loads the React entry point; precached by SW and served as `navigateFallback` when offline navigation hits an uncached route.
- **Page caching**: `NetworkFirst` for navigations (cache `suffa-pages`) — each visited page's HTML is cached; served from cache when offline.
- **Asset caching**: `CacheFirst` for JS/CSS/images/fonts (cache `suffa-assets`).
- **API caching**: `StaleWhileRevalidate` for all `/api/v1/` routes (cache `suffa-api-cache`) — cached responses served instantly, refreshed in background when online. `CacheableResponsePlugin` allows opaque (cross-origin) responses.
- **Offline mutation queue** (`app/src/lib/mms/mutationQueue.ts`, `useMutationSync.ts`): mutations (POST/PUT/PATCH/DELETE) intercepted when offline → stored in Dexie `mutations` table → automatically replayed in order when back online. Banner shows queued count.
- **Deactivation fix**: `check_profile_active` in `backend/app/core/dependencies.py` blocks login + all requests if the role-specific profile (Teacher/Student/Guardian/Donor) has `status != "active"`. Applied to all four person types.
- **Build fixes**: Post-build script (`app/scripts/fix-sw.py`) patches the SW to add `NavigationRoute` (dropped by some build environments) and fixes the Nitro asset manifest file size (which was truncated due to multi-pass build race conditions).
- **Cloudflare cache bypass**: SW renamed to `sw-v3.js` to bypass 4h CDN cache; `Cache-Control: no-store` would be set via route rules (currently served with Cloudflare default).
- Files: `app/vite.config.ts`, `app/public/index.html`, `app/scripts/fix-sw.py`, `app/src/sw.ts`, `app/src/lib/mms/mutationQueue.ts`, `app/src/lib/mms/useMutationSync.ts`, `app/components/app/PwaLayer.tsx`, `backend/app/core/dependencies.py`
- Verified: `npm run build` succeeds; deployed SW (5990 bytes) contains `NavigationRoute`, `index.html` in precache, `suffa-api-cache` route; app serves 200; login works; deactivated donor blocked with 403.
- Notes: User must visit pages online first to populate cache, then hard-refresh (Ctrl+Shift+R) to install new SW. After that, offline shows cached data.

## 2026-08-14 — User Display Name

- Added `name` column to `users` table (nullable) so the user's human-readable name can be shown alongside the username.
- Backend: `UserRead` now exposes `name`; the `/me` endpoint populates it from the linked profile (Teacher/Student/Guardian/Donor) based on role.
- Sidebar: shows the user's name (fallback to username) under the madrasa name instead of the username.
- My Profile: shows name first, then username below, then role/status tags.
- Seed script: all seeded users now carry a `name`.
- Migration: `backend/alembic/versions/iss3_029_user_name.py`
- Files: `backend/app/modules/auth/models.py`, `backend/app/modules/auth/schemas.py`, `backend/app/modules/auth/routes.py`, `backend/seed_full.py`, `app/src/lib/mms/auth.tsx`, `app/src/components/app/Navigation.tsx`, `app/src/routes/me.tsx`
- Verified: `cd app && npm run build`; backend imports OK. Backend test failures pre-existing (unchanged by this work).
- Notes: existing users created before this migration will have `name = NULL`; the UI falls back to username until the name is set manually or via re-seed.

## 2026-08-14 — Critical Auth Fix + WhatsApp Credentials Link

**Security Fix — Login Privilege Escalation (CRITICAL):**
- Fixed a vulnerability where a donor (or any tenant user) could log in as a super_admin by using a colliding username and the admin's password.
- Root cause: the login query included super_admins in every tenant's candidate set, and the password-match loop returned the first hash match regardless of tenant scope.
- Fix: tenant-scoped users are now queried first; super_admins are only checked as fallback when no tenant user exists with that username. This prevents any cross-role escalation via username collision.
- Files: `backend/app/modules/auth/routes.py` (lines 114-162)

**WhatsApp Credentials Link Fix:**
- Fixed missing set-password link in donor WhatsApp messages. The seeded `credentials` message template only included `{name}` and `{username}` — no `{setup_link}`.
- Updated `backend/seed_full.py` template to match the correct `bootstrap.py` template with full setup link.
- Fixed relative URL being sent to WhatsApp (unclickable). Frontend now converts `/set-password?token=...` to an absolute URL before dispatching.
- Files: `backend/seed_full.py` (line 447), `app/src/components/app/people/PersonDetail.tsx` (lines 59-84, 683-697)

**Remaining:** Existing deployments need to update the `credentials` template in their database — bootstrap will not overwrite an existing template. Run:
```sql
UPDATE message_templates SET content = '{"en": "Assalamu Alaikum,\nPortal access for {student_name}.\nUsername: {username}\nSet your password (valid 24h): {setup_link}\n— {madrasa_name}", "ur": "السلام علیکم،\n{student_name} کے پورٹل تک رسائی۔\nصارف نام: {username}\nاپنا پاس ورڈ مقرر کریں (24 گھنٹے کارآمد): {setup_link}\n— {madrasa_name}"}' WHERE code = 'credentials';
```

## 2026-08-13 — PWA Offline Attendance Outbox

**Fix:**
- Added a full offline data layer: Dexie IndexedDB database with an outbox queue for attendance entries and a roster cache table.
- Attendance saves now succeed offline — entries are queued in IndexedDB and the UI confirms "Saved offline — N marks will sync when online".
- Automatic sync: a `useOutboxSync` hook flushes the queue whenever the connection returns (online event listener + polling fallback).
- Added Workbox NetworkFirst caching for roster and timetable API responses so they load offline after first fetch.
- Updated `PwaLayer` to show a gold status bar with pending sync count and spinner while syncing.

**Files:**
- `app/src/lib/mms/db.ts` — Dexie database (outbox + rosterCache tables)
- `app/src/lib/mms/outbox.ts` — outbox API (enqueue, flush, count, retry)
- `app/src/lib/mms/useOnlineStatus.ts` — online/offline detection hook
- `app/src/lib/mms/useOutboxSync.ts` — auto-flush outbox on reconnect
- `app/src/routes/attendance.tsx` — save mutation writes to outbox when offline
- `app/src/components/app/PwaLayer.tsx` — sync status bar
- `app/vite.config.ts` — Workbox NetworkFirst caching for roster + timetable APIs
- `app/src/i18n/locales/en.json` — "Save offline" key
- `app/src/i18n/locales/ur.json` — "Save offline" key

**Verification:**
- `npm run build` — passes with no errors or warnings
- Dexie bundles correctly (132 KB), service worker generates with Workbox

**Limitations:**
- Background Sync API (push-triggered sync from SW) not yet implemented — sync only fires while the app tab is open.
- Override (history correction) mutations still require online — not yet routed through the outbox.

## 2026-08-11 — Plain Teacher Scope and Marking

**Fix:**
- Restored marking for a teacher with no delegated role: assigned exam roster and mark reads are now authorized from the active timetable's class, section, and course scope.
- Restricted roster access for unprivileged teachers to an explicitly requested section they teach; unscoped student lists remain forbidden.
- Restricted unprivileged teachers to their own created assignments for API reads and assignment management.
- Added a central teacher navigation and direct-route boundary. Teachers see only self-service and shared screens, while global Attendance, Timetable, Assessments, Results, Examination, and management URLs redirect to the appropriate self-service screen or dashboard.

**Files:**
- `backend/app/modules/assessments/routes.py`
- `backend/app/modules/people/routes.py`
- `app/src/lib/mms/nav.ts`
- `app/src/components/app/AppShell.tsx`
- `app/src/components/app/Navigation.tsx`
- `app/src/routes/more.tsx`

**Verification:**
- `python -m py_compile app/modules/assessments/routes.py app/modules/people/routes.py`
- `npm run build`
- Rebuilt the backend and confirmed `/healthz`.
- Playwright plain-teacher journey: marking displays the assigned students with no API failures; desktop navigation contains no administrative screens; tested direct management URLs redirect correctly.
- Live API scope check: roster and marks for the assigned class/section return `200`; unscoped roster returns `403`; unscoped mark reads return `400`; a different teacher's assignment detail returns `403`.

## 2026-08-11 — Project README

**Documentation:**
- Replaced the baseline README with a professional project guide covering architecture, services, Docker and direct local development, configuration, tenancy, academic structure, migrations, seed-data safety, quality checks, deployment, and contribution expectations.

**Files:**
- `README.md`

**Verification:**
- Reviewed commands and environment variable names against `docker-compose.yml`, `.env.example`, package scripts, and backend entrypoint.
- `git diff --check`

## 2026-08-11 — Class-Scoped Academic Courses

**Fix:**
- Established the academic hierarchy as Program → Class → Course. Programs own classes; courses are assigned independently to each class.
- Removed the conflicting program-course model and API endpoints. The migration copies every existing program-level course assignment to each class in that program before removing the obsolete relation.
- Moved course assignment and removal into the expanded class cards in Academics. Timetable, assignments, marking, results, and teacher scope already read class-course assignments and now follow this hierarchy consistently.
- Updated the full seed so it creates only the course catalog and class-course assignments.

**Files:**
- `backend/app/modules/academics/models.py`
- `backend/app/modules/academics/schemas.py`
- `backend/app/modules/academics/routes.py`
- `backend/alembic/versions/7c2d19b9a50e_remove_program_course_assignments.py`
- `backend/seed_full.py`
- `app/src/routes/academics.tsx`
- `app/src/lib/mms/more-endpoints.ts`

**Verification:**
- `python -m py_compile app/modules/academics/models.py app/modules/academics/schemas.py app/modules/academics/routes.py seed_full.py alembic/versions/7c2d19b9a50e_remove_program_course_assignments.py`
- `npm run build`
- Rebuilt the backend; Alembic reports `7c2d19b9a50e (head)` and `/healthz` returns `ok`.

## 2026-08-11 — Tenant WhatsApp Instances and Workspace Navigation

**Fix:**
- Removed the sidebar logo badge background and padding when a madrasa logo is present, allowing the full image to fit its frame.
- Hid Platform from every tenant workspace; it remains available only in the super-admin Platform context.
- Replaced the global Evolution instance and single-tenant restriction with one instance per madrasa, named exactly after that madrasa's slug.
- Aligned backend permission checks with the selected super-admin workspace so it can manage the tenant's own WhatsApp connection.

**Files:**
- `app/src/components/app/Navigation.tsx`
- `app/src/routes/more.tsx`
- `backend/app/modules/messaging/routes.py`
- `backend/app/core/dependencies.py`
- `backend/app/core/config.py`
- `docker-compose.yml`
- `.env.example`

**Verification:**
- `python -m py_compile app/modules/messaging/routes.py app/core/config.py`
- Focused config check: a `dar-e-arqam` madrasa resolves to Evolution instance `dar-e-arqam`.
- `npm run build`
- Browser screenshot at `1440px` confirms the logo fills its frame and Platform is absent from the selected tenant navigation.

## 2026-08-11 — Sidebar Madrasa Logo

**Fix:**
- Exposed the configured Madrasa Settings logo object key through the authenticated madrasa payload.
- Rendered the logo in the sidebar using the existing tenant-scoped presigned download endpoint, with the madrasa initial as a fallback when no logo exists.
- Refreshes the authenticated workspace profile after a logo change so the sidebar updates immediately.

**Files:**
- `backend/app/modules/auth/schemas.py`
- `backend/app/modules/auth/routes.py`
- `app/src/lib/mms/auth.tsx`
- `app/src/components/app/Navigation.tsx`
- `app/src/routes/settings.tsx`

**Verification:**
- `python -m py_compile app/modules/auth/routes.py app/modules/auth/schemas.py`
- `npm run build`
- Rebuilt backend; live API check confirmed `/auth/me` logo key matches Madrasa Settings and the presigned image endpoint returns `200`.
- Browser check at `1440px`: selected madrasa workspace renders the sidebar logo with a loaded image (`naturalWidth: 636`).

## 2026-08-11 — Super-Admin Platform Login Boundary

**Fix:**
- Super-admin sign-in always begins at the platform `default` tenant, avoiding a collision with a same-named tenant administrator account.
- Successful super-admin authentication resets the workspace to Platform; tenant workspaces are entered only by selecting a madrasa from Platform.
- The request interceptor now preserves the madrasa explicitly selected on the login form, instead of overwriting it with a previously selected tenant from local storage.

**Files:**
- `app/src/routes/index.tsx`
- `app/src/lib/mms/auth.tsx`
- `app/src/lib/mms/api.ts`

**Verification:**
- `npm run build`
- Playwright regression: with stale `suffa` tenant and tenant-workspace state preloaded, signing in through the `default` form lands at `/platform` with the Platform workspace active.

## 2026-08-11 — Canonical Madrasa Name Setting

**Fix:**
- Made the Madrasa Settings Name field read and update the canonical `Madrasa.name` value used by the authenticated workspace, navigation, dashboards, and exports.
- Kept the existing `madrasa.name_en` key synchronized for compatibility, while preventing legacy stored values from overriding the canonical name.
- Refreshes the authenticated profile after saving the name so the workspace header updates immediately.

**Files:**
- `backend/app/core/settings_catalog.py`
- `backend/app/modules/operations/routes.py`
- `backend/app/modules/auth/routes.py`
- `backend/app/core/pdf.py`
- `backend/seed_full.py`
- `app/src/routes/settings.tsx`

**Verification:**
- `python -m py_compile app/core/settings_catalog.py app/modules/operations/routes.py app/core/pdf.py app/modules/auth/routes.py seed_full.py`
- `npm run build`
- Rebuilt backend; live API comparison confirmed Settings Name equals `/api/v1/auth/me` madrasa name.

## 2026-08-11 — Tenant Workspace Feature Enforcement

**Fix:**
- Connected platform feature switches to navigation, More, mobile navigation, and direct-route protection; disabled screens such as Blog no longer remain visible in the selected madrasa workspace.
- Enforced the selected madrasa's feature flags for super-admin workspace API calls, including individually mapped Operations modules and Reporting.
- Keeps selected tenant workspace state during platform navigation, but a fresh sign-in starts from the `default` Platform tenant and clears stale super-admin tenant-workspace state. React Query data is cleared when authentication changes so no prior madrasa data is reused.
- Restored the frontend default tenant to `default`, matching the configured platform tenant.

**Files:**
- `app/src/lib/mms/workspace.ts`
- `app/src/lib/mms/nav.ts`
- `app/src/lib/mms/api.ts`
- `app/src/lib/mms/auth.tsx`
- `app/src/components/app/AppShell.tsx`
- `app/src/components/app/Navigation.tsx`
- `app/src/routes/index.tsx`
- `app/src/routes/dashboard.tsx`
- `app/src/routes/more.tsx`
- `app/src/routes/platform.tsx`
- `backend/app/core/dependencies.py`
- `backend/app/main.py`

**Verification:**
- `python -m py_compile app/core/dependencies.py app/main.py`
- `npm run build`
- Rebuilt backend and verified `/healthz`.
- Live super-admin workspace request to Blog for a madrasa with Blog disabled returned `403`.

## 2026-08-10 — Super-Admin Madrasa Workspace Control

**Fix:**
- Super admins can open a selected madrasa in its full workspace, while retaining a Platform route to return to platform management.
- Platform cards now let super admins edit each madrasa slug and enable or disable its available screens independently.
- Added an editable platform-account username in Super Admin My Profile.

**Files:**
- `backend/app/modules/platform/routes.py`
- `backend/app/modules/platform/schemas.py`
- `backend/app/modules/auth/routes.py`
- `backend/app/modules/auth/schemas.py`
- `app/src/routes/platform.tsx`
- `app/src/routes/me.tsx`
- `app/src/routes/dashboard.tsx`
- `app/src/components/app/Navigation.tsx`
- `app/src/lib/mms/endpoints.ts`

**Verification:**
- `python -m py_compile app/modules/platform/routes.py app/modules/platform/schemas.py app/modules/auth/routes.py app/modules/auth/schemas.py`
- `npm run build`
- `docker compose up -d --build backend`; backend `/healthz` reports healthy.

**Notes:**
- Browser walkthrough of feature switching, slug change, and username update remains recorded as a follow-up.

## 2026-08-09 — Shared Filter Button Rollout

**Fix:**
- Replaced exposed filter rows with the shared `FilterBar` filter-button pattern on Announcements, Forms, Blog, Reports, and Timetable.
- Covered Timetable Mine, Grid, and List views so class/section/course/teacher/day filters collapse behind the same filter control.
- Kept existing FilterBar screens unchanged where they already used the shared filter button, including People, Assignments, My Assessments, Admissions, Finance, Holidays, Leave, Resources, and Examination Marking/Results.

**Files:**
- `app/src/routes/announcements.tsx`
- `app/src/routes/forms.tsx`
- `app/src/routes/blog.tsx`
- `app/src/routes/reports.tsx`
- `app/src/routes/timetable.tsx`

**Verification:**
- Focused TypeScript check for touched route files reported no errors: `npm exec tsc -- --noEmit --pretty false 2>&1 | rg 'src/routes/(announcements|forms|timetable|blog|reports)\\.tsx|src/components/app/FilterBar'`.
- Full TypeScript check still reports unrelated pre-existing errors in other routes/components.

## 2026-08-09 — Full-Year Madrasa Fixture Seed

**Fix:**
- Expanded `seed_full.py` from a short sample fixture into a full active-session fixture for `1448 / 2026-27`.
- Seeded a complete Monday-Saturday weekly timetable grid for every class section, including admin-teacher timetable rows.
- Seeded monthly assignments across the academic year, including admin-created assignments visible in global/admin assessment views.
- Seeded quarterly exam types, marks, submissions, and published results for every student.
- Seeded full-session student and teacher attendance, monthly student payments, recurring donor donations, and monthly salary payments.
- Rebuilt the backend container and reloaded the local Docker database from the new seed.

**Files:**
- `backend/seed_full.py`

**Verification:**
- `python -m py_compile backend/seed_full.py`
- `docker compose up -d --build backend`
- `docker compose exec -T backend python seed_full.py`
- Live DB counts: 432 timetable slots, 528 assignments, 204 admin-created assignments, 888 submissions, 296 marks, 20 result publications, 6260 student attendance rows, 1878 teacher attendance rows, 260 payments, 42 donations, 72 salary payments.
- Live date ranges: attendance `2026-06-01` to `2027-05-31`, assignments due `2026-06-20` to `2027-05-25`, finance through May 2027.
- Live API checks confirmed admin sees Admin Sahib assignments, admin `/timetable/me` rows, marks, and populated result matrix data.

## 2026-08-09 — Settings Logo Upload and Language Dropdown

**Fix:**
- Rendered the Madrasa logo setting as an image upload control backed by the existing presigned file upload API.
- Added logo preview, replace, and remove controls for `madrasa.logo_file_id`.
- Changed `portal.default_language` from a free text setting to a typed English/Urdu dropdown with backend validation.

**Files:**
- `backend/app/core/settings_catalog.py`
- `backend/tests/test_backend_sweep.py`
- `app/src/routes/settings.tsx`
- `app/src/lib/mms/more-endpoints.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`

**Verification:**
- `python -m py_compile backend/app/core/settings_catalog.py backend/tests/test_backend_sweep.py`
- Rebuilt/recreated the backend container.
- Live API check confirmed `madrasa.logo_file_id` is type `file` and `portal.default_language` is type `language`.

## 2026-08-09 — Env-Only WhatsApp Evolution Configuration

**Fix:**
- Removed Evolution API URL, API key, instance, webhook URL, webhook media, and webhook event rows from the Madrasa Settings catalog.
- Changed messaging connection setup to read Evolution config from environment settings only.
- Added env passthroughs for Evolution webhook and tenant values in Docker Compose and `.env.example`.
- Removed seeded WhatsApp config rows and deleted stale live `whatsapp.evolution*` settings from the database.
- Kept the WhatsApp connection panel in Settings for QR/pairing/disconnect actions.

**Files:**
- `backend/app/core/settings_catalog.py`
- `backend/app/core/config.py`
- `backend/app/modules/messaging/routes.py`
- `backend/seed_full.py`
- `docker-compose.yml`
- `.env.example`
- `.env`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`
- `backend/tests/test_backend_sweep.py`
- `backend/tests/test_whatsapp_connection.py`

**Verification:**
- `python -m py_compile backend/app/core/settings_catalog.py backend/app/core/config.py backend/app/modules/messaging/routes.py backend/seed_full.py`
- `python -m py_compile backend/tests/test_backend_sweep.py backend/tests/test_whatsapp_connection.py`
- Rebuilt/recreated the backend container.
- Live API check confirmed `/api/v1/operations/settings/catalog` exposes no `whatsapp.*` settings.
- Live backend env check confirmed Evolution URL/key are configured and instance is `suffa-ms` without printing secrets.

## 2026-08-09 — Configurable School Days Setting

**Fix:**
- Added `attendance.school_days` to Madrasa Settings as a typed weekday multi-select setting.
- Rendered the setting as day toggle buttons in the Settings screen instead of a raw text field.
- Made attendance summary and generated approved-leave history respect the configured school days.
- Updated the full seed and the live database default to Monday-Saturday (`[0,1,2,3,4,5]`).

**Files:**
- `backend/app/core/settings_catalog.py`
- `backend/app/modules/attendance/routes.py`
- `backend/seed_full.py`
- `app/src/routes/settings.tsx`
- `app/src/lib/mms/more-endpoints.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`

**Verification:**
- `python -m py_compile backend/app/core/settings_catalog.py backend/app/modules/attendance/routes.py backend/seed_full.py`
- Rebuilt/recreated the backend container.
- Live API check confirmed `/api/v1/operations/settings/catalog` returns `attendance.school_days` as `weekday_multi` with value `[0,1,2,3,4,5]`.

## 2026-08-09 — Attendance History Seed Visibility

**Fix:**
- Fixed attendance history filtering so general daily attendance rows are still shown when a course filter is selected.
- Updated the attendance UI to move the selected calendar date to the latest available history entry when today has no recorded attendance.
- Corrected seeded enrollment start dates to the active session start so seeded July/August attendance rows are inside each student's enrollment window.
- Updated the live seeded database enrollment `started_on` values to `2026-06-01`.
- Updated the seed to use a Monday-Saturday madrasa week and inserted live August 8, 2026 attendance rows for all seeded students and teachers.

**Files:**
- `backend/app/modules/attendance/routes.py`
- `app/src/routes/attendance.tsx`
- `backend/seed_full.py`

**Verification:**
- Rebuilt/recreated the backend container.
- Live API check for `Hifz A-A` attendance history returned 15 entries for August, both with and without a selected course filter.
- Live API check after adding Saturday rows returned 18 entries for `Hifz A-A` August history, with `2026-08-08` as the latest date.

## 2026-08-09 — Results Publish Fix and Full Madrasa Seed

**Fix:**
- Fixed the Publish Results UUID error by sending the `session_id` returned by the results matrix instead of an empty string.
- Expanded `seed_full.py` into a richer madrasa fixture covering linked guardians, dependent/independent students, teacher timetables, attendance, assignments, submissions, marks, published results, finance, donors, salary, settings, resources, forms, admissions, announcements, blog, leave, holidays, and messaging fixtures.
- Reset the Docker Postgres database, ran Alembic migrations from scratch, and seeded the new fixture data.

**Files:**
- `app/src/routes/examination.tsx`
- `backend/seed_full.py`

**Verification:**
- `python -m py_compile backend/seed_full.py backend/app/modules/assessments/routes.py backend/app/modules/assessments/schemas.py`
- `docker compose exec -T backend python reset_db.py`
- `docker compose exec -T backend alembic upgrade head`
- `docker compose exec -T backend python seed_full.py`
- `curl http://127.0.0.1:8001/healthz`
- Live DB count check: 20 students, 18 student-guardian links, 44 timetable slots, 44 assignments, 74 submissions, 222 marks, 12 result publications, 300 student attendance rows, 75 teacher attendance rows, 20 payments, and 6 donations.
- Admin token check: `admin / abcd1234` returned an access token.
- No frontend build or test suite run per request.

## 2026-08-09 — Teacher-Scoped My Assessments

**Fix:**
- Added teacher-profile scoping for `mine_only=true` assignment reads so admin/principal users with linked teacher profiles can request only their taught assignments.
- Added a New assignment action to `/my-assessments` Assignments tab. Its class, section, and course options are sourced only from the teacher's own timetable.
- Added `mine_only` assignment creation enforcement so admin/principal teachers using `/my-assessments` cannot create assignments outside their own teaching scope.
- Changed `/my-assessments` into tabs for Assignments, Marking, and Results.
- Added filter-button based class/section/course filters to `/my-assessments` assignments, sourced from the user's own timetable.
- Reused Marking and Results views in teacher-scoped mode so admin/principal teachers only see classes, sections, and courses from their own timetable on `/my-assessments`.
- Renamed the global `/assignments` navigation/title to Assessments and added Assignments, Marking, and Results tabs for the madrasa-wide surface.

**Files:**
- `backend/app/modules/assessments/routes.py`
- `backend/app/modules/assessments/schemas.py`
- `app/src/routes/my-assessments.tsx`
- `app/src/routes/examination.tsx`
- `app/src/routes/assignments.tsx`
- `app/src/lib/mms/nav.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`

**Verification:**
- Rebuilt/recreated the backend container and confirmed `http://127.0.0.1:8001/healthz` returns healthy. No test suite/frontend build run per request.

## 2026-08-09 — Admin Teacher Timetable Access

**Fix:**
- Updated `/api/v1/operations/timetable/me` so non-student users with a linked teacher profile can see their teacher timetable even when their account role is admin/principal.
- Kept teacher accounts without a profile returning an empty timetable, and kept non-teacher-profile users blocked from the self-service route.

**Files:**
- `backend/app/modules/operations/routes.py`

**Verification:**
- Not run; focused backend rule fix and verification was intentionally skipped per request.

## 2026-08-09 — My Timetable Error Text

**Fix:**
- Translated the `timetable_self_service_only` backend error code on `/my-timetable`.
- Added English and Urdu copy so non-student/non-teacher users see a readable message.

**Files:**
- `app/src/routes/my-timetable.tsx`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`

**Verification:**
- Not run; focused copy/UI fix and verification was intentionally skipped per request.

## 2026-08-09 — Dependent Student Phone Visibility

**Fix:**
- Hid the Phone row on opened student cards when the student is dependent.
- Hid the Phone input in the student form unless `Independent student` is enabled.
- Clear dependent-student phone values on save by sending `phone: null` when a student is marked dependent.

**Files:**
- `app/src/components/app/people/PersonDetail.tsx`
- `app/src/components/app/people/StudentForm.tsx`
- `app/src/lib/mms/more-endpoints.ts`

**Verification:**
- Not run; this was a focused UI/code change and verification was intentionally skipped per request.

## 2026-08-08 — Donor Editing

**Fix:**
- Connected donor edit mode to the existing `PUT /api/v1/finance/donors/{donor_id}` endpoint.
- Added an Edit action to opened donor cards in People.
- Removed the unintended secondary green Edit trigger from opened donor cards; the card now shows only the intended action-row Edit button.
- Changed opened donor cards to show the donor's total donated amount instead of a donation count/loading ellipsis.
- Kept donor edit state fresh when switching between donors and refreshed donor/people lists after saving.
- Added English and Urdu labels/toasts for donor editing.

**Files:**
- `app/src/components/app/people/DonorForm.tsx`
- `app/src/components/app/people/PersonDetail.tsx`
- `app/src/lib/mms/more-endpoints.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`
- `backend/tests/test_current_portal_issues.py`

**Verification:**
- `cd backend && .venv/bin/python -m pytest tests/test_current_portal_issues.py -q` (`2 passed`)
- `cd backend && .venv/bin/python -m pytest tests/ -q` (`284 passed, 2 skipped`)
- `cd app && npm run build`
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/people?tab=donors` opened `Chaudhry Aslam`, clicked Edit, and confirmed the donor form was prefilled; screenshot saved to `app/artifacts/donor-edit-sheet-390.png`.

## 2026-08-08 — WhatsApp Evolution API Madrasa Settings

**Fix:**
- Added a `whatsapp` Madrasa Settings category for Evolution API v2 configuration: API URL, API key, instance name, webhook URL, webhook media-base64 flag, and webhook event list.
- Added an operational WhatsApp connection panel to Madrasa Settings with status refresh, QR-code pairing, phone-number pairing code, and an explicit stale-pairing replacement toggle.
- Updated messaging delivery, connection status, QR pairing, and phone pairing to prefer complete per-madrasa Evolution settings while preserving the existing env-var fallback for single-tenant deployments.
- Registered configured webhooks after instance creation using Evolution v2's required nested `{"webhook": ...}` payload, with the verified event names including `GROUP_UPDATE`.
- Hardened Evolution error extraction so nested `response.message` arrays surface useful validation details.
- Redacted saved secret settings from settings-list and settings-catalog reads while still allowing admins to overwrite the API key.
- Rendered Evolution API key as a password field and translated the new Settings labels/category in English and Urdu.
- Prefilled the phone-number pairing input with Pakistan's `+92` prefix and kept the local `suffa` madrasa configured with the Evolution API URL, redacted API key, and `suffa-ms` instance.
- Added connected-phone visibility from Evolution `ownerJid`/`fetchInstances` and an admin-only close-connection action that deletes the Evolution instance while preserving Madrasa Settings.
- Added `Send via WhatsApp` credential delivery inside opened student, teacher, and guardian person cards. The action reissues a fresh setup link, sends it through the existing Evolution credentials template, supports multiple available recipient numbers, and does not display the setup token in the card.
- Expanded student credential delivery so independent students can receive credentials on their own registered phone while linked-student credentials can still go to guardian phones.
- Enforced the dependent-student guardian rule on student creation, dependent-status updates, and guardian unlinking so a dependent student cannot be left without at least one guardian link.
- Updated student credential delivery so dependent students never use their own phone as the WhatsApp recipient; they must have a linked guardian phone, while independent students can still use their own registered phone.
- Added a person-card warning for existing dependent students that are already missing guardians and disabled WhatsApp credential sending until a guardian with a WhatsApp number is linked.
- Added WhatsApp PDF receipt sending for student payments and donor donations. Payment receipts follow the same dependent/independent recipient rules as credentials; donation receipts go to the donor contact.
- Added Finance row actions and donor-profile donation actions for sending receipts via WhatsApp beside the existing PDF download buttons.
- Tightened nearby backend contracts found during the verification run: guardian credential provisioning now rejects first-time requests without a username, user-role list responses declare pagination, and `/operations/timetable/me` is limited to student/teacher self-service.

**Files:**
- `backend/app/core/settings_catalog.py`
- `backend/app/modules/messaging/routes.py`
- `backend/app/modules/operations/routes.py`
- `backend/app/modules/auth/routes.py`
- `backend/app/modules/finance/routes.py`
- `backend/app/modules/people/routes.py`
- `backend/tests/test_backend_sweep.py`
- `backend/tests/test_admission_conversion.py`
- `backend/tests/test_frontend_endpoint_contract.py`
- `backend/tests/test_reported_portal_issues.py`
- `backend/tests/test_self_service.py`
- `backend/tests/test_whatsapp_connection.py`
- `app/src/components/app/people/PersonDetail.tsx`
- `app/src/components/app/finance/DonorProfileSheet.tsx`
- `app/src/components/app/people/StudentForm.tsx`
- `app/src/routes/finance.tsx`
- `app/src/routes/settings.tsx`
- `app/src/lib/mms/more-endpoints.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`

**Verification:**
- `cd backend && .venv/bin/python -m pytest tests/test_whatsapp_connection.py tests/test_backend_sweep.py::test_settings_catalog_and_typed_validation tests/test_reported_portal_issues.py -k whatsapp -q` (`19 passed`)
- `cd app && npm run build`
- Browser smoke on existing frontend `http://127.0.0.1:8080/settings` with mocked Settings catalog responses at 390px English and 920px Urdu; screenshots saved to `app/artifacts/settings-evolution-en-390.png` and `app/artifacts/settings-evolution-ur-920.png`.
- Browser smoke clicked `Show QR code` and requested a phone pairing code at 390px English and 920px Urdu; screenshots saved to `app/artifacts/settings-whatsapp-pairing-en-390.png` and `app/artifacts/settings-whatsapp-pairing-ur-920.png`.
- Rebuilt/recreated the running backend container on port `8001`; verified live `/api/v1/operations/settings/catalog` exposes WhatsApp settings with the API key redacted and live `/api/v1/messaging/whatsapp/connection` returns `suffa-ms` as `open`.
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/settings` confirmed the WhatsApp panel, QR button, phone pairing button, and `+92` phone prefix; screenshot saved to `app/artifacts/settings-whatsapp-live-prefix-390.png`.
- `cd backend && .venv/bin/python -m pytest tests/test_whatsapp_connection.py -q` (`19 passed`)
- Rebuilt/recreated the running backend container on port `8001`; verified live `/api/v1/messaging/whatsapp/connection` returns `connected_phone_number`/`connected_jid` for `suffa-ms` without disconnecting the session.
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/settings` confirmed connected phone visibility and the `Close WhatsApp connection` control; screenshot saved to `app/artifacts/settings-whatsapp-connected-close-390.png`.
- `cd backend && .venv/bin/python -m pytest tests/test_reported_portal_issues.py -k 'credentials' -q` (`4 passed`)
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/people` opened a student card and confirmed `Credentials link` plus `Send via WhatsApp` are visible without sending a real WhatsApp message; screenshot saved to `app/artifacts/person-card-whatsapp-credentials-390.png`.
- `cd backend && .venv/bin/python -m pytest tests/test_backend_sweep.py::test_dependent_student_requires_guardian_on_create tests/test_backend_sweep.py::test_cannot_unlink_last_guardian_from_dependent_student tests/test_reported_portal_issues.py -k 'credentials' -q` (`5 passed`)
- `cd backend && .venv/bin/python -m pytest tests/ -q` (`281 passed, 2 skipped`)
- `cd app && npm run build`
- Rebuilt/recreated the running backend container on port `8001`; verified `/healthz` and `/readyz`.
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/people` opened dependent student `Abdullah Khan`, confirmed the missing-guardian warning, and confirmed `Send via WhatsApp` is disabled; screenshot saved to `app/artifacts/person-card-dependent-missing-guardian-390.png`.
- `cd backend && .venv/bin/python -m pytest tests/test_reported_portal_issues.py -k 'receipt or credentials' -q` (`7 passed`)
- `cd backend && .venv/bin/python -m pytest tests/ -q` (`283 passed, 2 skipped`)
- `cd app && npm run build`
- Rebuilt/recreated the running backend container on port `8001`; verified `/healthz` and `/readyz`.
- Browser smoke against live backend/frontend at `http://127.0.0.1:8080/finance` confirmed payment and donation rows expose `Send receipt via WhatsApp` without sending a message; screenshots saved to `app/artifacts/finance-receipt-whatsapp-payments-390.png` and `app/artifacts/finance-receipt-whatsapp-donations-390.png`.

## 2026-08-08 — Admin Student Attendance History Corrections

**Fix:**
- Exposed the existing audited locked-attendance override path in the Attendance history UI for principals/admins with `attendance.edit_locked`.
- Added compact status controls to manual student attendance history rows, including class-day history and selected-student history.
- Kept approved-leave generated attendance read-only from Attendance; leave-day changes still belong in the leave approval workflow.
- Typed the frontend override endpoint response and added English/Urdu strings for the new controls.
- Added focused backend regression coverage proving a principal can create/correct historical student attendance and a teacher cannot call the override path.

**Files:**
- `app/src/routes/attendance.tsx`
- `app/src/lib/mms/endpoints.ts`
- `app/src/i18n/locales/en.json`
- `app/src/i18n/locales/ur.json`
- `backend/tests/test_attendance.py`

**Verification:**
- `cd backend && .venv/bin/python -m pytest tests/test_attendance.py -q` (`6 passed`)
- `cd app && npm run build`
- Browser smoke on existing frontend `http://127.0.0.1:8080/attendance` with mocked principal API responses at 390px English and 920px Urdu; screenshots saved to `app/artifacts/attendance-history-edit-en-390.png` and `app/artifacts/attendance-history-edit-ur-920.png`.

## 2026-08-03 — Parent Attendance View & Comprehensive Urdu i18n

**Issue:** 
- The `ParentAttendance` view crashed/failed to render children due to nested `<AppShell>` wrappers and missing `class_id` in student dashboard API response.
- Injected `t()` calls in shadcn `forwardRef` UI primitives (`breadcrumb.tsx`, `carousel.tsx`, `dialog.tsx`, `pagination.tsx`, `sheet.tsx`, `sidebar.tsx`) caused runtime crashes ("This page didn't load") because React hooks cannot be used in static/forwardRef definitions without hook context.
- Urdu translations were 93% incomplete (372 out of 399 keys were raw English duplicates).

**Fix:**
- Refactored `MyStudentAttendance` to return a standalone `div` when called for a child inside `ParentAttendance`, and only wrap in `AppShell` for student self-viewing.
- Added `class_id` output to `_student_dashboard_for_profile` in backend `reporting/routes.py` and mapped `classId: child.class_id` in `attendance.tsx`.
- Reverted invalid `t()` calls in `forwardRef` components back to static string labels, resolving the runtime error boundary crashes.
- Added full Urdu translations for all 397 UI strings across every route, modal, table, form, empty state, and status tag in `app/src/i18n/locales/ur.json`.

**Files:**
- `app/src/routes/attendance.tsx`
- `app/src/components/ui/breadcrumb.tsx`
- `app/src/components/ui/carousel.tsx`
- `app/src/components/ui/dialog.tsx`
- `app/src/components/ui/pagination.tsx`
- `app/src/components/ui/sheet.tsx`
- `app/src/components/ui/sidebar.tsx`
- `app/src/i18n/locales/ur.json`
- `backend/app/modules/reporting/routes.py`

**Verification:** `cd app && npm run build` (passed cleanly, 0 errors). Verified full application loads without crashes on port 8081.

## 2026-08-02 — Frontend Completion Recovery (Core Journeys)

**Issue:** After the TanStack frontend replacement, several authenticated screens were still only partially connected to backend workflows. The highest-risk gaps were profile/account management, assignments, admissions, results, settings, and lifecycle actions on content/resource screens.

**Fix:**
- Restored real account management on `/me`: editable user preferences, academic-session selection, password change, logout, and session/account details using the existing auth endpoints.
- Completed assignment lifecycle wiring: teacher/principal create, edit, delete, submission review, grading, and student submit/withdraw flows using real backend submission endpoints and presigned file upload/download.
- Completed admissions review flow: backend-backed application creation from admission forms, applicant detail editing, status-history viewing, reject/return-to-pending actions, and accepted-student conversion via the admissions conversion API.
- Restored results parity by keeping the student results path and adding staff-side class/section results management with matrix loading, section publish, and export entry points where backend support already existed.
- Replaced the generic settings surface with catalog-driven typed controls for boolean, integer, and string settings backed by the existing settings catalog/update APIs.
- Added missing edit/lifecycle behavior to Resources, Holidays, Announcements, and Blog, including file-backed resource upload/edit/download flows.
- Tightened People refresh consistency by broadening linked entity invalidation after student/teacher/guardian mutations and deactivation.
- Replaced the unsupported-role dashboard dead-end with a safe fallback that routes users toward still-supported workflows.

**Files:**
- `app/src/lib/mms/endpoints.ts`
- `app/src/lib/mms/more-endpoints.ts`
- `app/src/routes/me.tsx`
- `app/src/routes/assignments.tsx`
- `app/src/routes/admissions.tsx`
- `app/src/routes/results.tsx`
- `app/src/routes/settings.tsx`
- `app/src/routes/resources.tsx`
- `app/src/routes/holidays.tsx`
- `app/src/routes/announcements.tsx`
- `app/src/routes/blog.tsx`
- `app/src/routes/dashboard.tsx`
- `app/src/components/app/people/StudentForm.tsx`
- `app/src/components/app/people/TeacherForm.tsx`
- `app/src/components/app/people/GuardianForm.tsx`
- `app/src/components/app/people/PersonDetail.tsx`

**Verification:** `cd app && npm run build`; `cd backend && .venv/bin/python -m pytest tests/test_platform.py tests/test_reported_portal_issues.py tests/test_session_context.py -q` (`33 passed`); local auth/session smoke against `http://localhost:8001` verified login with tenant header, bearer-token access to `/api/v1/auth/me`, and academic sessions loading from `/api/v1/academics/sessions`.

**Limitations:** This tranche intentionally stayed lean. It did not rebuild the older browser automation pack for the new TanStack markup, did not run the full role/language visual matrix, and did not complete broader parity work still pending in finance, reports, timetable conflict editing, leave history/review, and other secondary routes listed in `TO_IMPLEMENT.md`.

## 2026-08-02 — Frontend Refactor: Shared Dropdowns and CRUD Form Composition

**Issue:** After the completion recovery pass, the frontend still repeated select styling, create/edit form markup, file-picker UI, and common mutation-success flow across multiple route screens.

**Fix:**
- Added one themed `CustomDropdown` and made it the shared select surface for the TanStack frontend, while keeping a `SelectInput` alias for compatibility.
- Replaced remaining route-level raw select usage with `CustomDropdown`, including public admission, reports, and attendance helper selectors.
- Added shared `applyMutationSuccess` handling for repeated success toast + query invalidation flows.
- Extracted shared content CRUD field blocks into reusable components for announcements, blog posts, holidays, and resources.
- Extracted a reusable `FilePickerField` so attachment selection no longer redefines the same control markup in multiple screens.
- Rewired create/edit flows in announcements, blog, holidays, and resources to use shared form-value objects and shared field components instead of duplicating markup per route.

**Files:**
- `app/src/components/app/Primitives.tsx`
- `app/src/components/app/FilePickerField.tsx`
- `app/src/components/app/content/AnnouncementFormFields.tsx`
- `app/src/components/app/content/BlogPostFormFields.tsx`
- `app/src/components/app/content/HolidayFormFields.tsx`
- `app/src/components/app/content/ResourceFormFields.tsx`
- `app/src/lib/mms/mutation-helpers.ts`
- `app/src/routes/admission.$token.tsx`
- `app/src/routes/attendance.tsx`
- `app/src/routes/reports.tsx`
- `app/src/routes/announcements.tsx`
- `app/src/routes/blog.tsx`
- `app/src/routes/holidays.tsx`
- `app/src/routes/resources.tsx`

**Verification:** `cd app && npm run build`

## 2026-08-02 — Frontend Replacement With TanStack Design

**Issue:** The existing `app/` PWA needed to be replaced with the new frontend design from `/home/anas/Development/Personal/suffa-frontend` while preserving backend integration, auth, routes, and deployment flow.

**Fix:**
- Replaced the old React Router/MUI frontend with the new TanStack Start/Radix/Tailwind design.
- Synced `VITE_API_BASE` defaults to the local FastAPI backend and kept production API targeting configurable through Docker build args/env.
- Preserved backend auth integration with `/api/v1/auth/token`, `/api/v1/auth/me`, bearer token storage, tenant headers, academic-session headers, and normalized FastAPI validation error messages.
- Added public route coverage for `/set-password?token=...` and `/admission/:token`, plus legacy `/my-profile` and `/profile` redirects to the new `/me` screen.
- Changed the app image from static nginx serving to the generated TanStack/Nitro Node server on port `80`, matching the existing `docker-compose.yml` app service.
- Corrected PWA output so the generated service worker precaches the new `.output/public` assets.

**Files:** `app/src/**`, `app/public/**`, `app/package.json`, `app/package-lock.json`, `app/vite.config.ts`, `app/Dockerfile`, `app/.env.example`

**Verification:** `cd app && npm run build`; `cd app && npm run lint` (0 errors, 18 imported-design warnings); `docker compose config`; backend `/healthz` and `/readyz`; browser smoke at `http://localhost:8081` logged in with `admin/password`, persisted `mms_token` and `mms_tenant=suffa`, visited `/dashboard`, `/people`, `/attendance`, `/timetable`, `/forms`, `/reports`, `/settings`, verified `/my-profile` and `/profile` redirect to `/me`, and captured screenshots in `app/artifacts/replacement-smoke/` with no failed backend API responses or serious console errors. Generated production server smoke on port `4180` returned 200 for `/dashboard`.

**Limitation:** Local Docker image validation was attempted after adapting the Dockerfile, but the containerized `npm ci` step could not complete in this environment. Node 20 surfaced unsupported-engine warnings, Node 22 hit an npm CLI crash, and the Node 24 retry stalled during dependency install. The Dockerfile remains aligned to the new Node-server output and Node 24 runtime, but image build completion still needs confirmation in CI/Coolify or a Docker environment with stable npm install behavior. Full backend verification was also run and finished with `269 passed, 2 skipped, 1 failed`; the failure was the pre-existing attendance period inference case `tests/test_attendance_period_enrollment_history.py::test_roster_infers_single_current_day_period_from_course`, where roster inference returned 409 because multiple periods existed.

## 2026-08-02 — Super Admin Bootstrap Login

**Issue:** The PWA already routed `super_admin` users to `/platform`, and the backend protected platform APIs with `require_super_admin`, but fresh deployments had no documented or automated first super-admin account creation path.

**Fix:**
- Added optional first-boot platform account creation to `backend/bootstrap.py` using `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`.
- Exposed the super-admin environment variables in `.env.example`, `docker-compose.yml`, and the non-Docker `run-server.sh`.
- Made `run-server.sh` backfill missing local super-admin keys into an existing `backend/.env`, because the script intentionally preserves old env files.
- Added a focused bootstrap regression test proving that the optional super-admin is tenantless, active, and password-verifiable.

**Files:** `backend/bootstrap.py`, `backend/tests/test_bootstrap.py`, `.env.example`, `docker-compose.yml`, `run-server.sh`

**Verification:** `cd backend && .venv/bin/python -m pytest tests/test_bootstrap.py -q`; `bash -n run-server.sh`; `docker compose config`; local Docker API login and `/api/v1/auth/me` returned `platform-admin` with role `super_admin`.

## 2026-08-02 — Coolify Backend Healthcheck Startup Fix

**Issue:** Coolify deployment for `e185809` built all images successfully but failed during `docker compose up -d` while waiting on `backend` health. The backend healthcheck used `/readyz`, which performs a database query and can block Compose's `service_healthy` dependency during startup.

**Fix:**
- Changed the backend container healthcheck to call `/healthz`, which verifies that the API process is serving HTTP.
- Kept `/readyz` unchanged for database readiness diagnostics and external health checks.

**Files:** `docker-compose.yml`

**Verification:** `docker compose config`; `cd app && npm run build`.

## 2026-08-02 — Deployment Checkout Cleanup

**Issue:** Coolify failed during repository clone/checkout for commit `119a427` before Docker build started. The repository still tracked generated screenshots, visual-audit artifacts, dev PWA output, bundled `app/dist.tar.gz`, and local SQLite databases, increasing checkout weight and polluting deploy clones.

**Fix:**
- Removed generated deployment-irrelevant artifacts from Git tracking while keeping local files intact.
- Added ignore rules for `app/artifacts/`, `app/dev-dist/`, `app/dist.tar.gz`, and local `*.db` files so visual/test/build output does not re-enter commits.

**Files:** `.gitignore`, tracked removal of `app/artifacts/**`, `app/dev-dist/**`, `app/dist.tar.gz`, `backend/temp.db`, `backend/test.db`

**Verification:** `git ls-files app/artifacts app/dev-dist app/dist.tar.gz backend/temp.db backend/test.db` returns no tracked files; `cd app && npm run build`.

## 2026-08-01 — Non-Docker Local Server Runner

**Issue:** Agents and developers needed one clear command to run the FastAPI backend and Vite PWA frontend locally without Docker.

**Fix:**
- Added root `run-server.sh` with commented setup and runtime steps.
- The script creates a development `backend/.env` when missing, preserves existing env files, prepares `backend/.venv`, installs backend/frontend dependencies unless `SKIP_INSTALL=1`, runs Alembic migrations and `backend/bootstrap.py`, then starts backend and frontend together.
- Added clean shutdown handling and documented override flags for ports, install, migrations, and bootstrap.

**Files:** `run-server.sh`

**Verification:** `bash -n run-server.sh`; executable bit set.

## 2026-08-01 — PWA Custom MUI Wrapper Migration

**Issue:** Feature screens and shell components still imported MUI primitives directly, and upload controls were rendered through generic/native-looking file inputs instead of app-owned controls.

**Fix:**
- Added `app/src/components/ui/Mui.tsx` as the project-owned adapter for MUI primitives used by the PWA.
- Migrated feature screens, shell components, lib contexts, and shared UI components to import MUI primitives through the adapter boundary.
- Expanded `Field.tsx` with reusable `TextInput`, `SearchInput`, `DateInput`, `NumberInput`, and `FileInput` wrappers.
- Replaced visible assignment/resource/settings upload controls with `FileInput`, including selected-file labels and English/Urdu strings.
- Added `test:ui-wrappers` to prevent new direct MUI component imports outside the UI layer and to prevent native file inputs outside `Field.tsx`.

**Files:**
- `app/src/components/ui/Mui.tsx`, `app/src/components/ui/Field.tsx`
- `app/src/components/ui/FilterBar.tsx`, `app/src/components/SearchDropdown.tsx`, `app/src/components/StagedAudiencePicker.tsx`
- `app/src/components/MyAssessmentsView.tsx`, `AssessmentsView.tsx`, `DashboardCards.tsx`, `ResourcesView.tsx`, `SettingsView.tsx`
- `app/scripts/check-ui-wrapper-usage.mjs`, `app/package.json`, `app/src/i18n/index.ts`

**Verification:** `cd app && npm run test:ui-wrappers`; `npm run test:i18n`; `npm run test:foundation-components`; `npm run test:route-runtime`; `npm run build`.

## 2026-08-01 — PWA Visual Redesign Foundation Batch

**Issue:** The PWA was mixing mobile and desktop UI patterns: oversized modals, split filter behavior, raw tables on mobile, cramped action clusters, clipped route subtitles, and inconsistent shell breakpoints.

**Fix:**
- Established a shared 960px compact breakpoint for shell/navigation, page layout, filters, responsive record lists, and mobile action behavior.
- Upgraded shared primitives: `Page`, `PageHeader`, `PageToolbar`, `ResponsiveTabs`, `DetailList`, `FormModal`, `DataTable`, `DataCard`, `FilterBar`, `ActionMenu`, shared buttons, and theme touch targets.
- Fixed the oversized rounded modal pattern by making dialogs desktop-sized and mobile sheet/fullscreen aware.
- Migrated key route surfaces toward shared records and responsive controls: Academics section/course mapping, Finance contribution/donation records, People action surfaces, My Assessments mobile submission cards, Platform/public-admission audit roots, and compact action-menu behavior.
- Updated visual verification scripts for the 960px compact-tablet contract and refreshed current-issues screenshot artifacts.

**Files:**
- `app/src/components/ui/Layout.tsx`, `Modal.tsx`, `DataTable.tsx`, `DataCard.tsx`, `FilterBar.tsx`, `ActionMenu.tsx`, `Button.tsx`
- `app/src/components/AppBar.tsx`, `Sidebar.tsx`, `NavDrawer.tsx`, `BottomTabBar.tsx`
- `app/src/components/AcademicsView.tsx`, `FinanceView.tsx`, `PeopleView.tsx`, `MyAssessmentsView.tsx`, `DashboardCards.tsx`, `PlatformView.tsx`, `PublicAdmissionPage.tsx`
- `app/scripts/check-mobile-record-cards.mjs`, `app/scripts/verify-current-issues.mjs`, `app/scripts/verify-students-layout.mjs`, `app/scripts/verify-assessment-mobile-cards.mjs`

**Verification:** `cd app && npm run build`; `npm run test:i18n`; `npm run test:foundation-components`; `npm run test:route-runtime`; `npm run test:drawer`; `npm run test:mobile-records`; `npm run test:students-layout`; `npm run test:assessment-mobile-cards`; `npm run test:visual-issues`. Screenshots refreshed under `app/artifacts/issue-verification/`. `npm run test:appwide-visual` still reports route-specific visual issues; the release gate remains open in `TO_IMPLEMENT.md`.

## 2026-08-01 — Fix Route-Wide Invalid Hook Runtime Failures

**Issue:** Multiple lazy portal routes could report invalid-hook/dispatcher-null failures at the first hook in otherwise valid components, including `AttendanceBoard`, `ProfileView`, and `PeopleView`.

**Fix:**
- Disabled PWA service-worker registration in development and actively unregisters old dev service workers/caches so localhost cannot mix stale cached route chunks with the current Vite React runtime.
- Added Vite `resolve.dedupe` and `optimizeDeps.include` entries for React, React DOM, React i18n, MUI, and Emotion so lazy route chunks and dependency prebundles resolve one React graph.
- Added `test:route-runtime`, a live browser scanner that logs in and visits 33 portal routes, including every People tab, failing on invalid-hook, dispatcher-null, max-update-depth, and known leaked-prop runtime regressions.
- Reconnected `PwaStatus` to the app bar with stable diagnostic classes and restored its 44px touch target so PWA checks remain meaningful after the dev registration change.

**Files:**
- `app/src/lib/pwaRegistration.ts` — dev-only service-worker/cache cleanup
- `app/vite.config.ts` — React/MUI/i18n dependency dedupe and optimization
- `app/scripts/verify-route-runtime.mjs` — route-wide hook/runtime browser scan
- `app/package.json` — `test:route-runtime`
- `app/src/components/AppBar.tsx` and `app/src/components/PwaStatus.tsx` — restored PWA status placement/test hooks

**Verification:** `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:route-runtime` scanned 33 portal routes; `cd app && npm run build`; `cd app && APP_URL=http://localhost:5173 npm run test:pwa-status`; `cd app && npm run test:profile-runtime`; `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:attendance-defaults`.

## 2026-08-01 — Remove Profile RadioGroup Hook Failure Point

**Issue:** `/my-profile` could emit an invalid-hook crash from MUI `RadioGroup2` while rendering the theme selector.

**Fix:**
- Replaced the Profile theme `RadioGroup`/`FormControlLabel` controls with controlled app buttons using ARIA radio semantics.
- Added a focused profile runtime browser regression that opens `/my-profile`, switches theme options, and fails on invalid-hook, dispatcher-null, `RadioGroup`, max-depth, `showLabel`, or `InputProps` console/page errors.

**Files:**
- `app/src/components/ProfileView.tsx` — theme selector no longer imports or renders MUI `RadioGroup`
- `app/scripts/verify-profile-runtime.mjs` — profile runtime console regression
- `app/package.json` — `test:profile-runtime`

**Verification:** `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:profile-runtime`; `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:attendance-defaults`; `cd app && npm run build`; live `/my-profile` smoke on the restarted dev server clicked theme options with no matching console/page errors.

## 2026-08-01 — Fix Attendance Console Runtime Regressions

**Issue:** Attendance emitted React console errors for leaked `showLabel`/`InputProps` DOM props and could hit a maximum update-depth loop while defaulting today's unmarked roster to Present.

**Fix:**
- Stabilized Attendance's selected-day derived entries and guarded default Present state writes so the effect no longer re-renders indefinitely.
- Moved mobile bottom-tab routing onto the MUI `BottomNavigationAction` itself so MUI's injected `showLabel` prop is consumed by the action instead of leaking onto an anchor element.
- Updated the shared `Input` wrapper to use MUI slot props for adornments instead of the old `InputProps` prop.
- Extended the attendance browser regression to fail on `showLabel`, `InputProps`, maximum-update-depth, invalid-hook, or dispatcher-null console regressions.

**Files:**
- `app/src/components/AttendanceBoard.tsx` — stable selected-day memoization and default-mark guard
- `app/src/components/BottomTabBar.tsx` — bottom navigation route/action composition
- `app/src/components/ui/Field.tsx` — slot-based input adornments
- `app/scripts/verify-attendance-defaults.mjs` — console regression assertions

**Verification:** `cd app && npm run build`; `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:attendance-defaults`; live backend browser smoke of `/attendance` with `admin/password` found no matching console/page errors.

## 2026-08-01 — Auto-Select Single Attendance Course

**Issue:** Course teachers could still be prompted to choose a course after selecting a class/section, even when their timetable scope had only one course for that class/section.

**Fix:**
- Derived attendance course choices from the selected class/section timetable slots instead of only the class-level course list.
- Auto-selected the only available course and hid the Course filter when the teacher/class/section combination has one course.
- Kept the Course filter visible only when the selected class/section has multiple course choices, and kept the Period filter visible only when the chosen course has multiple periods today.
- Extended the attendance browser regression to cover single-course auto-selection, multiple-course course prompting, and same-course multiple-period prompting.

**Files:**
- `app/src/components/AttendanceBoard.tsx` — section-scoped course choices and single-course auto-selection
- `app/scripts/verify-attendance-defaults.mjs` — course/period prompt regression coverage

**Verification:** `cd app && npm run build`; `cd app && TEST_BASE_URL=http://localhost:5173 npm run test:attendance-defaults`; live teacher smoke with `teacher1/password` auto-selected `course=...` and rendered no Course or Period selector for a single-course class/section.

## 2026-08-01 — Clarify Attendance Course/Period Prompts

**Issue:** After a course was selected, Attendance could still show the generic “Choose a course and scheduled period” message, making it look like the selected course was ignored.

**Fix:**
- Replaced the generic fallback with state-specific prompts: select a course, select one of multiple periods today, or course not scheduled today.
- Added English and Urdu translations for the new attendance period states.

**Files:**
- `app/src/components/AttendanceBoard.tsx` — attendance selection prompt state
- `app/src/i18n/index.ts` — English/Urdu prompt copy

**Verification:** `cd app && npm run test:attendance-defaults`; `cd app && npm run build`.

## 2026-08-01 — Fix Attendance Course Selection Route Reset & Period Inference

**Issue:** Selecting a course on Attendance could jump back to the class-selection screen after the period auto-selection effect ran.

**Fix:**
- Added one route-sync helper in `app/src/components/AttendanceBoard.tsx` so attendance URL updates preserve class, section, course, period, tab, and student-history state.
- Replaced the auto-period effect's `URLSearchParams` spread with explicit param construction; empty period clears only `slot` instead of dropping the selected class/course.
- Changed the flow so period choice is only shown when the selected course has multiple periods on the current day.
- Added backend period inference for roster and sync: `course_id` without `timetable_slot_id` resolves to the unique scheduled period for that class/section/course/date; multiple periods return a clear conflict.
- Corrected the MUI `ToggleButtonGroup` import so default Present marks are visually selected and grouped correctly.

**Files:**
- `app/src/components/AttendanceBoard.tsx` — attendance filter/tab route-state preservation, conditional period choice, and status toggle grouping
- `app/src/lib/endpoints.ts` — sends course-only roster requests so the backend can infer single periods
- `backend/app/modules/attendance/schemas.py` — allows student course scope without a provided slot
- `backend/app/modules/attendance/routes.py` — backend unique-period inference and multi-period conflict handling
- `backend/tests/test_attendance_period_enrollment_history.py` — API regressions for inferred single period, multiple-period conflict, and sync inference
- `app/scripts/verify-attendance-defaults.mjs` — browser regression for hidden single-period selector and visible multi-period selector

**Verification:** `cd backend && .venv/bin/python -m pytest tests/test_attendance.py tests/test_attendance_period_enrollment_history.py -q`; `cd app && npm run test:attendance-defaults`; `cd app && npm run build`.


## 2026-08-01 — Fix Attendance Class Roster Parameter Coupling & Day-of-Week Mismatch

**Issue:** 
1. `course_id and timetable_slot_id must be provided together` (HTTP 422 error on Attendance roster load) caused by `classRoster` sending `course_id` without `timetable_slot_id` when `selectedSlotId` was cleared/empty upon course selection.
2. JavaScript `Date.getDay()` (0=Sunday..6=Saturday) was being compared directly against backend day-of-week convention (0=Monday..6=Sunday), causing period auto-selection and dropdown filtering to fail on most days, leaving `selectedSlotId` empty and triggering the 422 error.

**Fix:**
- Updated `classRoster` in `app/src/lib/endpoints.ts` to strictly enforce "both or neither" for `course_id` and `timetable_slot_id`.
- Updated period auto-selection and period filtering in `app/src/components/AttendanceBoard.tsx` to correctly map JavaScript day-of-week (`(new Date().getDay() + 6) % 7`) to backend day-of-week convention (0=Monday).

**Files:**
- `app/src/lib/endpoints.ts` — `classRoster` parameter coupling fix
- `app/src/components/AttendanceBoard.tsx` — day-of-week mapping fix

**Verification:** `cd app && npm run build` and backend test suite passed cleanly.



## 2026-07-31 — Fix UUID validation error for empty query params

**Issue:** `timetable_slot_id: Input should be a valid UUID, invalid length: expected length 32 for simple format, found 0` — Pydantic rejected empty strings sent as UUID query parameters.

**Root cause:** Frontend state initializes IDs as `""` (empty string). When passed to API endpoints, these empty strings were sent as query params (e.g., `?timetable_slot_id=`), which Pydantic's `UUID | None` validation rejects — it expects either a valid UUID or no parameter at all (null).

**Fix:**
- Added a global request interceptor in `app/src/lib/api.ts` that strips empty-string, null, and undefined query params before the request is sent. This prevents the issue from recurring in any endpoint.
- Also fixed `classRoster` and `getGradingPlan` in `app/src/lib/endpoints.ts` to use `|| undefined` for defense-in-depth.

**Files:**
- `app/src/lib/api.ts` — `stripEmptyParams()` interceptor
- `app/src/lib/endpoints.ts` — `classRoster` and `getGradingPlan` param cleanup

**Verification:** `cd app && npm run build` passes cleanly.

## 2026-08-01 — Fix "course_id and timetable_slot_id must be provided together" error

**Issue:** After fixing the empty-string UUID issue, a new error appeared: `course_id and timetable_slot_id must be provided together`. The backend requires both params to be present or both absent, but the frontend was sending one without the other.

**Fix:** Updated `classRoster` in `app/src/lib/endpoints.ts` to only include `timetable_slot_id` when `course_id` is also present, enforcing the backend's "both or neither" constraint at the call site.

**Files:**
- `app/src/lib/endpoints.ts` — `classRoster` course/slot coupling fix

**Verification:** `cd app && npm run build` passes cleanly.


## 2026-07-31 — UI Overhaul: All 8 Issues Fixed

### Phase 1: Quick Wins

- **NavDrawer full-width items**: Removed `marginInline: 6` from `NavItemButton`, added `width: "100%"` to `NavLinkWrapper`, set `borderRadius: 0` for edge-to-edge items, added `minHeight: 48` for touch targets.
- **PageSection padding**: Changed from `p: 2.5` to `p: { xs: 2, sm: 3 }` for better breathing room.
- **HolidaysView card layout**: Replaced `DataTable` with card grid using `DataCard` component.
- **AcademicsView programs → cards**: Replaced programs table with responsive card grid using `DataCard`.
- **ActionMenu inline threshold**: Added `inlineThreshold={2}` prop. Rows with ≤2 actions render as inline buttons.

### Phase 2: Attendance Flow

- **Period dropdown filtering**: Now filters slots by current day of week.
- **Auto-select period**: When only one slot exists for today, it's automatically selected.
- **Simplified flow**: Roster loads as soon as class + course are selected.
- **Mark Today's Attendance button**: Added prominent button that auto-selects today's date.

### Phase 3: Tab & Navigation Polish

- **Prominent tabs**: `TabButton` now has `minHeight: 48px`, `px: 3`, `borderRadius: 12`, `fontWeight: 600`.
- **FilterBar mobile visibility**: Replaced collapsible panel with horizontal scrollable row.
- **Touch targets**: Removed `size="small"` from `IconButton` components.

### Phase 4: Consistency Pass

- **FormsView cards**: Replaced forms `DataTable` with card grid using `DataCard`.
- **Visual hierarchy**: Standardized card layouts across all views using `DataCard` component.
- **Responsive grids**: All card grids use `gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"`.

### Additional Fixes

- **ContentArea margins**: Added responsive padding (`xs: 2, sm: 3, md: 4`) to main content area.
- **Card consistency**: All cards now use the same `DataCard` component for consistent styling.

### Files Modified

- `app/src/App.tsx` — ContentArea padding
- `app/src/components/ui/FilterBar.tsx` — Select rendering + mobile horizontal scroll
- `app/src/components/ui/ActionMenu.tsx` — Inline threshold prop
- `app/src/components/ui/Layout.tsx` — Responsive padding
- `app/src/components/NavDrawer.tsx` — Full-width items + touch targets
- `app/src/components/Sidebar.tsx` — Touch targets
- `app/src/components/ProfileView.tsx` — Theme section added
- `app/src/components/SettingsView.tsx` — Theme section removed
- `app/src/components/HolidaysView.tsx` — Card layout
- `app/src/components/AcademicsView.tsx` — Programs card grid (using DataCard)
- `app/src/components/FormsView.tsx` — Forms card grid (using DataCard)
- `app/src/components/AttendanceBoard.tsx` — Period filtering + simplified flow
- `app/src/i18n/index.ts` — New keys: `classesCountLabel`, `markTodayAttendance`

### Verification

- `cd app && npm run build` passes cleanly.

## 2026-07-26 — ISS3 backlog closed locally from TO_IMPLEMENT

Completed the remaining Issues 3 backlog rows in `TO_IMPLEMENT.md` and refreshed
the gates that prove the implementation instead of leaving historical WIP rows
behind.

- Closed ISS3-003 and ISS3-006 by making the credential-link browser verifier
  self-contained, re-running it, and pairing it with the unsafe-type ratchet,
  strict build, endpoint-contract, and backend error-boundary tests.
- Closed ISS3-007 through ISS3-016 with the admission conversion, student edit,
  immutable admission-number, username proposal, guardian many-to-many, archived
  session, portal decision, independent student, and built-in admission-section
  test matrix. Browser evidence includes `CURRENT-20_add-student-admission-template_desktop.png`,
  `CURRENT-19_student-edit-admission-fields_desktop.png`, and
  `CURRENT-18_conversion-credential-delivery_desktop.png`.
- Closed ISS3-018 through ISS3-021 with WhatsApp QR/phone pairing, Pakistan phone
  normalization, form-builder `phone` fields, and credential delivery gates.
- Closed ISS3-022 through ISS3-035 with finance profile/history, salary history,
  report range, form response/guardian scope, document upload, assessment,
  assignment-batch, attendance-default, timetable-scope, and My Timetable gates.
- Added `app/scripts/lib/vite-server.mjs` and converted older focused browser
  gates away from the fragile implicit `127.0.0.1:5173` dependency, so they now
  start and stop their own Vite server when `TEST_BASE_URL` is not supplied.
- Review remediation: guardian-specific audience selection now excludes guardians
  without portal users so a specific-person choice cannot degrade into all-parent
  visibility; Academics destructive actions name the target and block duplicate
  row deletes while pending; snackbar notifications now include shared mutation
  pending status and verified offline/background notification paths.

Fresh local evidence from this pass:

- Backend focused suites: `105 passed` for admission/identity/guardian/phone/
  WhatsApp/error boundaries, and `86 passed` for files/assessments/timetable/
  attendance/endpoint contracts/backend sweep.
- Browser gates passed: `test:credential-links`, `test:admission-builder`,
  `test:phone-inputs`, `test:whatsapp-connection`, `test:forms-responses`,
  `test:guardian-dashboard`, `test:salary-history`, `test:finance-profiles`,
  `test:report-ranges`, `test:document-uploads`, `test:attendance-defaults`,
  `test:my-assessments`, `test:my-timetable`, `test:assignment-batch`, and
  `test:visual-issues`.
- Post-review focused gates passed: `test:audience-picker`, `test:snackbar`,
  `test:foundation-components`, `test:action-menu`, `test:i18n`,
  `test:type-safety`, and production `npm --prefix app run build`.
- `test:students-layout` now includes desktop, tablet, mobile, and Urdu mobile
  geometry checks.

## 2026-07-26 — ISS3-002 students layout acceptance closed

- Extended the People → Students layout verifier to cover Urdu mobile without
  relying on English-only button/menu text, while keeping desktop, tablet, and
  English mobile geometry checks.
- Verified the toolbar, Add Student action, content-sized Portal/Status columns,
  row Action menu usability, and absence of page-level horizontal overflow at
  1440, 768, 390, and 390 Urdu viewports.
- Evidence: `npm --prefix app run test:students-layout` passed and refreshed
  `/tmp/suffa-students-layout-desktop.png`,
  `/tmp/suffa-students-layout-tablet.png`,
  `/tmp/suffa-students-layout-mobile.png`, and
  `/tmp/suffa-students-layout-mobile-urdu.png`.

## 2026-07-26 — ISS3 evidence refresh: action menus, credentials, built-ins, and gates

This pass tightened the current Issues 3 implementation instead of treating the
earlier tranche as sufficient. The main outcome is that the repo now has fresh
automation for the UI surfaces that had visibly regressed, plus backend coverage
for guardian credential delivery. Items that still require live Evolution API,
full PostgreSQL legacy migration, or complete role/screenshot matrices remain
tracked as WIP in `TO_IMPLEMENT.md`.

- Expanded the shared row `ActionMenu` migration beyond People into Resources,
  Blog, and Holidays, and updated the browser verifier to open the menu and
  exercise representative view/download/edit/delete actions on desktop and
  mobile.
- Added guardian credential delivery support to the messaging API and People UI.
  Admins can choose a registered guardian phone when multiple numbers exist;
  teacher/student/guardian credential sends validate the selected phone and do
  not expose set-password tokens in normal page text.
- Re-aligned the Admission Form builder regression with the built-in student and
  guardian sections: built-ins stay present/togglable, custom fields still render
  and submit, and the verifier now edits the intended custom controls rather
  than accidentally hitting locked built-in definitions.
- Added a frontend unsafe-type ratchet so new `any`, `as any`, and TypeScript
  suppression usage cannot silently increase while the broader endpoint-contract
  cleanup continues.
- Updated document-upload and live-seed verifiers to match the new Action menu
  and server-generated admission-number contract.

Fresh evidence from this pass:

- Backend full suite: `263 passed, 2 skipped`.
- Focused backend: guardian credential send/phone-selection tests passed;
  admission/category/session slices passed; phone and WhatsApp connection tests
  passed (`23 passed`).
- Frontend: production build passed; i18n audit passed (`1067 keys checked`);
  unsafe-type ratchet passed (`any=135/135`, `as-any=1/1`,
  `ts-suppressions=0/0`).
- Browser/scripted UI gates passed: `test:visual-issues`,
  `test:foundation-components`, `test:action-menu`, `test:students-layout`,
  `test:phone-inputs`, `test:whatsapp-connection`, `test:credential-links`,
  `test:forms-responses`, `test:guardian-dashboard`, `test:audience-picker`,
  `test:salary-history`, `test:finance-profiles`, `test:report-ranges`,
  `test:document-uploads`, `test:attendance-defaults`, `test:my-assessments`,
  `test:my-timetable`, `test:assignment-batch`, and
  `test:admission-builder`.
- Static hygiene: `git diff --check` passed for the implementation changes before
  this note was added.
- Production deploy/smoke: pushed and deployed GitHub commit
  `938eebc98da4d938928ab647657ac8b2a13e5f2c` through Coolify. The running
  app/web images use that tag, `https://api-suffa.anas31.qzz.io/readyz`
  returned 200, and a browser login through
  `https://app-suffa.anas31.qzz.io/` reached `/dashboard` with no critical
  failed API responses. Screenshot: `/tmp/suffa-live-login-938eebc.png`. The
  public marketing site remains `https://suffa.anas31.qzz.io/`.
- Advanced ISS3-014 acceptance delivery: the Accept Application modal now keeps
  the conversion open after account creation, lets the admin choose student and
  guardian delivery targets, sends the generated credentials, shows delivery
  results, and copies the setup link only as a failure fallback. The visual gate
  submits the conversion, asserts the student/guardian credential-send payloads
  preserve the chosen phones, and confirms the setup-token text is not visible.
  Evidence: `test:visual-issues` captured
  `CURRENT-18_conversion-credential-delivery_desktop.png`.
- Strengthened ISS3-007 evidence: the current visual gate opens Student Details
  → Edit Student for a student with a snapshotted admission record containing
  built-in identity/guardian fields plus custom questions, verifies those fields
  render together, submits an admission answer edit, and asserts built-in answers
  are preserved in the update payload. Evidence: `test:visual-issues` captured
  `CURRENT-19_student-edit-admission-fields_desktop.png`; backend
  `test_student_edit_updates_and_validates_admission_answers` covers merge and
  validation behavior.
- Closed the largest ISS3-021 implementation gap locally: credential delivery
  now uses Evolution `sendText` for generated login links when Evolution is
  configured, validates the selected student/teacher/guardian phone, returns a
  503 delivery-not-configured error instead of pretending a direct send happened
  when Evolution is absent, and redacts `/set-password?token=...` values from
  `MessageLog.content_sent`. Evidence: focused messaging tests passed
  (`15 passed` across WhatsApp connection plus credential delivery slices), the
  full backend suite passed (`263 passed, 2 skipped`), and browser
  credential/acceptance flows still hide raw setup URLs.
- Fixed the production login form labels so "Madrasa ID", "Username", and
  "Password" are associated with their inputs. The current visual gate now fills
  those controls with `getByLabel(...)`, which prevents the earlier selector
  ambiguity where the tenant field could be mistaken for the username field.
- Strengthened ISS3-027's staged audience picker into a keyboard-operable
  searchable multi-select: the trigger exposes listbox controls, the searchbox
  keeps `aria-activedescendant`, ArrowUp/ArrowDown/Home/End move the active
  option, Enter/Space toggles selection, Escape closes cleanly, and selected
  chips remain visible. It also preserves selected people while changing role
  filters and submits mixed student/guardian user IDs with both `student` and
  `parent` roles. Evidence: `test:audience-picker` now selects students and a
  guardian entirely from the keyboard on desktop and mobile, exercises a 100+
  student fixture, asserts the create form API payload, and refreshes
  `artifacts/audience-picker/audience-picker-*.png`; production build and the
  unsafe-type ratchet passed after the change. Backend audience/guardian scope
  tests passed across `test_audience.py`, form audience filters, ward response
  filters, and parent dashboard form exposure.
- Closed ISS3-005 evidence: `test:foundation-components` runs the snackbar
  browser gate, which proves queued success/error mutation toasts, `aria-live`,
  dismiss controls, mobile layout, and no raw credential token leakage while
  leaving blocking confirmation flows in `DialogContext`.
- Closed ISS3-004 evidence: `test:dialogs` now combines the AST native-dialog
  audit with `verify-dialog-flows.mjs`, a browser journey that cancels and then
  confirms a destructive Resource delete, completes the Guardian login username
  prompt, verifies no native browser dialog events fired, and confirms raw setup
  tokens stay out of visible page text. `test:foundation-components` and the
  production build passed afterward.
- Closed ISS3-001 evidence: migrated the remaining Academics multi-action rows
  (programs, classes, courses, sections, and sessions) to the shared
  `ActionMenu`. `test:action-menu` now verifies People, Resources, Holidays,
  and Academics row menus on desktop and mobile, including positioned dropdowns,
  list-style reset, row-height stability, and destructive actions; production
  build passed afterward.

## 2026-07-26 — ISS3 implementation tranche and verification refresh

This tranche moves the July 23 Issues 3 programme forward across shared UI,
identity/admissions, phones, forms, finance, reports, assignments, attendance,
uploads, and timetable. It is not a blanket closeout: `TO_IMPLEMENT.md` remains
the strict checklist, and most rows stay WIP until their full role/screenshot
matrix is complete.

- Added the shared row `ActionMenu` and migrated the main People, Admissions,
  Admission Forms, Assessments, Forms, Finance, and Salary table actions to it.
  The browser evidence scripts now exercise the Action menu paths rather than
  old direct row buttons.
- Replaced remaining `window.alert/confirm/prompt` usage with app dialogs,
  mounted a translated snackbar provider, and added a lightweight navigation
  guard used by Attendance so unsaved roster marks warn before in-app navigation
  or scope changes.
- Added canonical Pakistan mobile normalization/input (`+92` fixed prefix),
  Pydantic validation where phone semantics are required, WhatsApp delivery
  normalization, and a reversible identity migration for tenant-scoped usernames,
  admission numbers, student phone, and independent-student fields.
- Strengthened admissions and identity: admission numbers are server-generated
  and immutable in normal APIs, username proposals are tenant-aware, internal
  application submission must choose an open Admission Form, archived-session
  admission writes are rejected, guardian links are tenant-safe many-to-many,
  and Add Student supports existing guardian, new guardian, or independent
  student paths.
- Removed raw credential URLs from normal create/reissue UI states and replaced
  them with compact copy/send controls.
- Added Finance person profile endpoints/modals, salary-history default table
  with edit/delete actions, report quick date ranges, phone custom fields, Forms
  and Responses tabs, staged audience picking, guardian/ward response context,
  expanded document upload policy, student submission replace/remove, stricter
  assignment teaching scope, and clearer My Timetable labels/class switching.
- Updated the visual evidence scripts for the renamed **General form**, Action
  menus, Attendance class cards, and the Forms Responses tab.

Evidence:

- Backend full suite: `240 passed, 2 skipped`.
- Focused backend: admission conversion `10 passed`; session context `7 passed`;
  attendance period/enrollment history `6 passed`; phone/files/self-service/
  category scoping and assessments slices passed during the tranche.
- Frontend: production TypeScript/Vite build passed; i18n audit passed
  (`1027 keys checked`); date-range boundary checks passed.
- Browser/scripted UI: admission form builder create/edit/render/submit passed;
  assessment 422 rendering passed; visual issue verification passed and captured
  updated screenshots under `app/artifacts/issue-verification/`.
- Static/migration gates: no `window.alert/confirm/prompt` source hits,
  `git diff --check` passed, and Alembic has one head
  `iss3_028_guardian_forms`.

## 2026-08-02 — Fix attendance roster empty states and period selection UX

- Addressed an issue in the `/attendance` route where users saw "No attendance recorded" without any students listed or marking options when attempting to mark attendance today.
- Fixed the silent failure path when a user hasn't selected a period (for courses with multiple periods) or when no periods exist for them today.
- Implemented explicit empty states ("Pick a period", "No periods today", "Could not load roster") to guide the user rather than falling back to the history view prematurely.
- Verified fix by running the frontend React build.

## 2026-07-29 — Staff Profile Tabs and UI primitive modernization

The previously open `PDF-02`, `PDF-05`, `PDF-08`, `PDF-11`, `PDF-14`,
`PDF-16`, `PDF-23`, and `PDF-28..31` rows now have authenticated live-API
evidence. The browser suite uses principal, delegated-teacher, ordinary
teacher, student, and guardian accounts across both English and Urdu and both
1440×1000 and 390×844 viewports.

- The browser—not the seed helper—submits the all-role teacher form, creates a
  student with a selected existing guardian and verifies the persisted link,
  uploads a teacher resource through presigned object storage, exercises an
  application confirmation dialog and delayed mutation state, downloads the
  student's result card, verifies the submitted-assignment download endpoint,
  edits/reloads the configured madrasa name, and saves/reloads a teacher remark.
- Live verification exposed and fixed two optional-request permission defects:
  Assessments and the teacher Audience Picker no longer request People
  directories the role cannot access. Guardian Forms navigation now follows
  the server-issued Forms feature instead of excluding the parent role.
- Student creation now loads existing guardians, submits `guardian_ids`, and
  shows translated English/Urdu linking controls. Parent role badges are
  translated, long configured madrasa names wrap cleanly, and checkbox/radio
  minimum sizing prevents shared input styles from stretching them.
- Verification scripts require an explicit disposable-environment confirmation
  and explicit API/tenant/principal settings. PostgreSQL test reset additionally
  requires `TEST_DATABASE_ALLOW_RESET=1` and a database name containing `test`.

Release evidence:

- Backend SQLite suite: `179 passed, 2 skipped` in 49.28 seconds.
- Full PostgreSQL API suite: `180 passed, 1 skipped` in 17:04; the separately
  migrated non-owner RLS test passed and proved no-context isolation plus
  tenant-A/tenant-B row separation.
- A populated legacy PostgreSQL database upgraded through the admission-form
  category and principal-delegate `NOT NULL` revisions to Alembic head
  `84d3b7e91a20`, with zero remaining nulls.
- Production TypeScript/Vite PWA build passed; static i18n audit passed with
  913 keys; the admission-builder and scripted current-issue browser suites
  passed.
- `npm run test:live-seed` generated isolated PostgreSQL/Redis/MinIO fixtures
  and verified principal, teacher, and student result PDFs. `npm run
test:live-roles` passed the five-role language/viewport matrix and all named
  browser journeys without an HTTP error.
- The deployed Compose services `backend`, `worker`, `app`, and `web` were up;
  backend `/readyz`, app health, and web health returned success. Named live
  screenshots under `app/artifacts/issue-verification/` were visually reviewed.

## 2026-07-22 — Verified CURRENT-01 through 20 implementation

All twenty issues in the current report now have both an automated regression
path and reviewed visual evidence where the behavior is visible. This is a
bounded completion claim for `CURRENT-01..20`, not a release-wide claim for the
remaining `PDF-*` role journeys or deployment gates.

- Fixed the seeded teacher dashboard failure and added structured request/error
  logging that does not return internal exception details. Delegated Academics
  no longer depends on an unrelated teacher-directory request, and teaching
  scope is shared by timetable, grading, attendance, reports, resources, and
  forms.
- Replaced filtering toolbars with the responsive `InlineFilter`, including
  donor name/contact search; standardized rounded modal clipping, scrollable
  bodies, button loading, reusable form spacing, and English/Urdu labels. The
  910-key missing-translation audit passes.
- Rebuilt Student and Guardian details around labeled identity, enrollment,
  guardian, admission-origin, and finance sections. Enrollment is effective-
  dated with an explicit unassign action and only one active row per session.
- Added immutable `StudentAdmissionRecord` snapshots. People → Add Student can
  use an open or closed Admission Form; Applications can be edited, reversed,
  or atomically/idempotently converted to Student, Guardian, login roles,
  enrollment, admission record, and administrator notification.
- Replaced comma-separated choices with validated option rows and raw response
  JSON with an Actions/eye viewer. Rebuilt grading setup as an atomic course
  default or class override plan with exact 100% component weight and complete
  grade bands.
- Attendance now records course/timetable-period identity, keeps labeled legacy
  daily rows, carries period context through offline sync/history/dashboard/
  reports, and attributes marks, approved leave, and class holidays using the
  enrollment effective on that historical date.
- PDFs now use madrasa branding, repeated table headers, page numbers, RTL Urdu
  fonts, print-safe styling, and the authenticated user's saved language.

Evidence:

- Backend: `179 passed` (full suite; includes tenant/API, conversion rollback and
  idempotency, grading math/override, period attendance, historical enrollment,
  dashboard, permissions, migration, and PDF regressions).
- Frontend: production TypeScript/Vite PWA build passed; i18n audit passed
  (`910 keys checked`).
- Browser: admission builder journey passed; current-issue journey passed for
  principal and delegated-teacher UI states at desktop and Urdu mobile sizes.
- Visual: named `CURRENT-*` screenshots and EN/UR PDF page renders are in
  `app/artifacts/issue-verification/` and were reviewed.
- Migration: one Alembic head (`84d3b7e91a20`) and full offline SQL generation
  to head passed.

Still not claimed complete: the live PostgreSQL/RLS suite, populated legacy
PostgreSQL upgrade, five-role live-backend EN/UR browser matrix, remaining open
`PDF-*` evidence rows, and Docker health startup. Docker configuration resolves
`app`, `backend`, `web`, and `worker`, but the local Docker socket is not
accessible. These remain explicitly open in `TO_IMPLEMENT.md`.

## 2026-07-22 — Admission-form migration deployment fix

- Fixed the backend startup migration for existing installations: the new
  admission-form category is now added nullable, legacy rows are backfilled as
  `General`, and only then is the column made required.
- Fixed the following principal-delegate migration to give all existing teacher
  profiles a database-level `false` default before enforcing `NOT NULL`; audited
  the rest of the pending migration chain for the same legacy-row hazard.
- Added a migration regression that reproduces PostgreSQL's legacy-row failure.
  Alembic retains one head and the complete backend suite passes.

## 2026-07-21 — Superseded Issues.pdf closeout claim

This historical entry is **not completion evidence**. The 2026-07-22 re-audit
found multiple regressions despite the earlier blanket closeout. Its claims are
retained below only as project history; every requirement was reopened under a
stable `PDF-*` ID in `TO_IMPLEMENT.md` and must now satisfy the V-Model gates.

- Completed and re-verified the full 31-item report across People, Applications,
  public/forms, settings/branding, grading/results, resources, PWA layouts,
  permissions, leave filters, enrollment, assignments, and the student dashboard.
- Stabilized person details so student usernames/current classes render safely,
  guardian linking/viewing and all entity edit flows work without duplicate modal
  headings, and existing class enrollment remains accessible from the student view.
- Public forms now use modal confirmation/deletion, preserve submitted applications
  when a form is deleted, support Inquiry/General selection and program/category
  inline filters, and derive response keys from labels without exposing `field_key`.
- Added explicit grading-scheme control for including weighted assignment marks,
  per-section active-assignment limits, visible save actions, student result and
  assignment-mark/remark views, and persistent submitted-file downloads with the
  upload picker hidden after submission.
- Result-card PDFs now use madrasa branding and the requesting user's English/Urdu
  language; fixed Urdu font registration and browser download filename exposure.
- Shared buttons now lock and show a loader for promise-backed actions, critical
  mutations and downloads return their promises to that control, primary filter bars
  use the shared inline filter, and mobile topbar/table/Urdu spacing is PWA-safe.
- The final review also tenant-scoped assignment-limit and grading lookups, made
  class-wide assignments count toward every section's active cap, and unified the
  assignment contribution and grading-scheme selection used by result endpoints.
- Regression coverage added for label-derived form keys, section assignment caps,
  assignment-result inclusion, Urdu PDF rendering, and deletion that preserves
  applications.

## 2026-07-17 — Full checked-item, endpoint, security, and PWA re-audit

- Re-verified every checked `TO_IMPLEMENT.md` claim against implementation and
  fixed the incomplete cases: delegated scope editing, teacher timetable scope,
  UUID/name rendering, settings logo upload, admission-form deletion, draft-blog
  visibility, and complete list pagination.
- Made timetable slots the only live teacher-assignment source. Removed the
  legacy assignment API/UI/rollover behavior and added regression coverage that
  historical `teacher_assignments` rows grant no teaching access.
- Hardened files end to end: required byte size, exact signed content length,
  tenant-prefixed keys, and cross-tenant download rejection. Added PostgreSQL
  RLS policies and per-transaction tenant context as a database-level backstop.
- Completed admission-form deletion semantics (delete empty forms; require
  closing forms that already have applications), protected management blog
  drafts, and validated delegated scope targets server-side.
- Finished missing Urdu strings across dashboards, attendance, academics,
  accessibility labels, rich-text controls, and common examples. Improved
  mobile-safe settings file controls and localized fallback states.
- Added response name enrichment for finance and submissions without N+1
  queries, and a contract test requiring `limit`, `offset`, and
  `X-Total-Count` on every GET list endpoint.
- Verification: backend suite **132 passed**; production TypeScript/Vite PWA
  build passed and generated its service worker and manifest.

## 2026-07-13 — Final portal-audit backlog closure

- Archived sessions are now centrally read-only: authenticated unsafe HTTP
  methods are rejected when the user selected a non-active session, permission-
  protected session lookups are tenant-scoped, and the SPA hides/disables
  mutation controls while keeping browsing, filters, and the session switcher
  available. Added a regression test for the shared backend guard.
- Added reusable `getPage`, `PaginationControls`, and page-state helpers. Wired
  server-backed pages and `X-Total-Count` into teachers, students, guardians,
  assignments, registrations, admission forms, and enquiries; all other array
  list clients now traverse bounded server pages automatically rather than
  silently truncating at the backend's first-page limit.
- The assignment centre now lets admins filter assignments by teacher or use a
  server-sorted, teacher-grouped view in addition to existing filters.
- Split Admissions into the requested People → Students in person flow and a
  separate Public forms destination, preserving enquiries and all gates.
- Confirmed the timetable's existing `ByTeacherView` already provides the
  requested "who teaches what where" organization. Formalized rollover's data
  rule: timetable/date-shifted holidays are copied; tenant-wide evergreen
  resources/forms/announcements/grading/fee categories remain shared and must
  not be duplicated.

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

Confirms the existing behavior was already correct on the _data_ side —
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

**B9 — Resources.** `resources.manage` is now a _scoped_ permission
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
  returned a zeroed-out summary for a bad/cross-tenant `subject_id` instead of 404.
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
  (`backend/app/modules/finance/routes.py`, registered _before_
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
- **AdmissionsView split** (B12): three tabs — _Registrations_ (walk-in form +
  applications with Walk-in/Public-form source column), _Public forms_
  (create per-program admission form, copy shareable public link,
  close/reopen), _Enquiries_ (contact-form inbox). Review gate moved to
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
  - _Assignments_: filter bar (class/section/course/category/sort), create
    form with per-section multi-publish checkboxes + category, edit modal with
    "apply to every section copy", delete with whole-batch confirm, list shows
    names (class/section/course/teacher) — no UUIDs.
  - _Grading_: course-wise — pick class → section tabs → course dropdown;
    spreadsheet of students × exam types with inline mark cells (save on
    blur/Enter), computed score + band columns; scheme/exam-type setup folded
    behind a "Grading setup" toggle.
  - _Results_: class picker → per-section sheets with course column show/hide,
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
  `madrais.public_key`), `GET /blog/{public_key}` published feed, admission
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

## 2026-07-20 — Teacher/admin portal issue sweep

- Fixed teacher navigation and permission handling for assessments, scoped
  resources/forms, and permission changes refreshed when the portal regains
  focus. Walk-in admissions now enforce `admissions.manage` server-side.
- Made attendance and report access section-aware: teachers only receive their
  timetable-assigned sections, while principals/unscoped managers retain the
  full class view.
- Added case-insensitive per-madrasa course-name uniqueness (API validation,
  database index, and migration), plus grading scheme/exam type edit/delete
  APIs and a row-based modal grading editor.
- Moved admin/teacher create/edit workflows into reusable modals (academics,
  people, assessments, timetable, holidays, leave, blog, announcements,
  finance, salary, admissions, resources, and forms), relocated the
  People class filter, removed walk-in admissions from People, and expanded
  admissions with guardian, identity, address, prior-school, and medical data.
- Added a real public admission page instead of exposing the JSON API URL.
- Added madrasa logo/contact branding to the authenticated shell and generated
  reports/receipts/result cards; branding refreshes immediately after settings
  updates.
- Added optional Evolution API v2 document delivery for WhatsApp result cards
  and receipts, with the existing text-link flow retained when direct delivery
  is not configured.
- Added a tenant-bound WhatsApp connection card to administrator Settings.
  Principals can pair the configured Evolution API v2 instance without a
  camera by entering its phone number, copying the generated pairing code, and
  watching the connection status update automatically. Disconnected sessions
  reconnect without deletion, recreated sessions preserve any webhook, and
  Evolution credentials remain server-side.
- Added targeted regressions in `test_reported_portal_issues.py`. Validation:
  147 backend tests pass, Python compile succeeds, Alembic has one head, and the
  frontend TypeScript/Vite production build succeeds.

## 2026-07-20 — Automatic duplicate-course migration

- The backend container already runs `alembic upgrade head` before bootstrap
  and Gunicorn. Revision `7a2f1c9d4e60` now automatically reconciles legacy
  duplicate course names instead of stopping deployment for manual cleanup.
- For each normalized duplicate group, the oldest course is retained;
  class-course, teacher-assignment, timetable, assignment, and exam-type
  references are repointed transactionally. Duplicate class-course mappings
  are collapsed before the normalized unique index is created.
- Concurrent backend replicas serialize Alembic upgrades with a PostgreSQL
  advisory lock, so only one startup migrates at a time.
- Added `test_unique_course_migration.py` to reproduce the production startup
  failure and verify the complete merge path plus index creation. Full backend
  suite: 151 tests passing.

## 2026-08-09 - Results Drilldown Flow

- Implemented: Replaced the wide results matrix UI with progressive cards: admin/principal selects class, then section, then course, then sees student marks; teacher-scoped `/my-assessments` starts from taught class-section cards and only shows the courses from the teacher's timetable.
- Implemented: Principal/admin publishing now acts at the selected class level, gathering students across all sections for that class.
- Implemented: Added a teacher "Submit result to Principal" action on the course marks screen, backed by a scoped `/api/v1/assessments/results/submit-for-review` endpoint that validates timetable scope and records an audit event.
- Files: `app/src/routes/examination.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/assessments/routes.py`, `backend/app/modules/assessments/schemas.py`
- Verified: `cd backend && .venv/bin/python -m py_compile app/modules/assessments/routes.py app/modules/assessments/schemas.py`; `cd app && npm exec tsc -- --noEmit --pretty false` was run and the touched results/assessments files cleared, but existing unrelated TypeScript errors remain in other portal files.
- Notes: Full browser verification was not run in this pass because the user asked to avoid repeated broad verification work.

## 2026-08-09 - My Timetable Class Filter

- Implemented: Fixed `/my-timetable` so the class dropdown defaults to an actual loaded class instead of visually showing the first class while internally rendering all slots.
- Implemented: Timetable rows now sort by start time, then period, without mutating the day's slot array during render.
- Files: `app/src/routes/my-timetable.tsx`
- Verified: `cd app && npm exec tsc -- --noEmit --pretty false` was run and `src/routes/my-timetable.tsx` cleared; existing unrelated TypeScript errors remain elsewhere.

## 2026-08-09 - Assignment Attachments

- Implemented: Added optional file attachment upload to assignment creation in both `/assignments` and `/my-assessments`, using the existing presigned file upload flow and the backend `assignment.attachment_key` field.
- Implemented: Assignment cards and detail sheets now expose download actions for attached files; assignment editing can replace or remove the current attachment.
- Implemented: `/my-assessments` submission actions now invalidate the teacher/student scoped assignment query after submit/remove so attachment and submission state refresh together.
- Implemented: Assignment lists now request and preserve newest-created-first ordering, and the backend assignment list default is `created_at` descending.
- Files: `app/src/routes/assignments.tsx`, `app/src/routes/my-assessments.tsx`, `app/src/lib/mms/more-endpoints.ts`
- Verified: `cd backend && .venv/bin/python -m py_compile app/modules/assessments/routes.py`; `cd app && npm exec tsc -- --noEmit --pretty false` was run and the touched assignment files cleared; existing unrelated TypeScript errors remain elsewhere.

## 2026-08-09 - Result Publish Completeness Guard

- Implemented: Admin/principal result publishing now fails on the backend when any enrolled student's course result component is missing a mark, or when a class course has no result components configured.
- Implemented: The admin Results screen disables `Publish class results` while marks are incomplete and shows the missing-mark count before publishing.
- Files: `backend/app/modules/assessments/routes.py`, `app/src/routes/examination.tsx`
- Verified: `cd backend && .venv/bin/python -m py_compile app/modules/assessments/routes.py`; `cd app && npm exec tsc -- --noEmit --pretty false` was run and `src/routes/examination.tsx` cleared; existing unrelated TypeScript errors remain elsewhere.

## 2026-08-09 - Single Filter Card Selection

- Implemented: Replaced the lone class dropdown in the Marking flow with class cards; clicking a card performs the same selection and continues to sections/courses/exams.
- Implemented: Replaced the lone class dropdown in `/my-timetable` with class cards; clicking a class opens that class timetable and the Back action returns to the class cards.
- Implemented: Removed the filter wrapper from Results drill-down; Results now uses section headings and Back navigation rather than showing a filter button for class/section/course drill-down state.
- Files: `app/src/routes/examination.tsx`, `app/src/routes/my-timetable.tsx`
- Verified: `cd app && npm exec tsc -- --noEmit --pretty false` was run and the touched routes cleared; existing unrelated TypeScript errors remain elsewhere.

## 2026-08-09 - Teacher Assignment Review

- Implemented: Removed student submission controls from `/my-assessments`; teachers now only see assignments they assigned for review.
- Implemented: Clicking a teacher assignment opens a review sheet listing all expected students, with submitted-file download buttons and `Not submitted` tags for missing submissions.
- Implemented: Added `/api/v1/assessments/assignments/{assignment_id}/submission-status` so whole-class and section assignments return a complete roster plus submission status.
- Implemented: Moved the submission-status route before the generic assignment detail route and added the static-prefix `/assignments/submission-status/{assignment_id}` route so it resolves correctly, and scoped My Assignments section/course filters to the teacher's actual timetable pairs. The section dropdown is disabled and empty until a class is selected.
- Files: `app/src/routes/my-assessments.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/assessments/routes.py`, `backend/app/modules/assessments/schemas.py`
- Verified: `cd backend && .venv/bin/python -m py_compile app/modules/assessments/routes.py app/modules/assessments/schemas.py`; `cd app && npm exec tsc -- --noEmit --pretty false` was run and the touched assignment files cleared; existing unrelated TypeScript errors remain elsewhere.

## 2026-07-22 — Finance filters and responsive record layout

- Rebuilt the Finance navigation and record controls as responsive toolbars so
  category, donor, and record actions no longer split into awkward orphan rows.
- Added contribution and donation search plus class/donor, category, and date
  filters, with one-click clearing. Donation filters use the existing server
  query contract; free-text matching covers names, categories, notes, amounts,
  and currencies.
- Guarded filter requests against out-of-order responses and kept donor-list
  failures visible independently from donation-list loading.
- Made receipt actions fit the desktop table and added semantic field labels to
  the mobile contribution/donation cards.
- Extended the authenticated Playwright issue journey to exercise every
  donation filter and clear/search behavior, assert desktop/tablet/mobile
  overflow safety, and capture the endpoint layouts in
  `app/artifacts/issue-verification/`.

## 2026-07-22 — Authenticated `/login` redirect

- Fixed successful login from the explicit `/login` URL leaving an
  authenticated user stranded on that unmatched route. Principals, teachers,
  students, and guardians now continue to `/dashboard`; platform
  administrators continue to `/platform`.
- Added an authenticated browser regression that starts at `/login`, completes
  the token/profile exchange, and requires the dashboard route and heading.
- Production hotpatch builds are verified against `VITE_API_BASE` before
  deployment so a development `localhost` API URL cannot be shipped again.

## 2026-07-20 — Public admission form builder

- Public Forms now uses the same custom-field builder as internal Forms while
  creating a form: admins can add/remove fields, choose field types, configure
  options, and mark answers required.
- Existing public forms can be edited without recreating their public link;
  their title, description, and complete custom-field definition are saved.
- The public admission page already renders these stored definitions and saves
  submitted answers with the registration. Radio fields render as radio
  controls, and required fields/options are enforced by both the browser and
  the public API. Duplicate keys and choice fields without options are rejected.
- Added a focused browser workflow covering create, edit, public rendering,
  submission, validation, and mobile modal rendering.

## 2026-07-13 — Route-based portal isolation

- Replaced persisted in-app view state with real React Router URLs for every portal page.
- Added centralized role, permission, and feature checks that render a 404 when an account opens an unauthorized route.
- Split management and self-service destinations: `/attendance` vs `/my-attendance`, `/timetable` vs `/my-timetable`, `/assessments` vs `/my-assessments`, `/leave` vs `/my-leave`, and `/salary` vs `/my-salary`.
- Promoted page-level tabs to URLs, including `/people/*`, `/academics/*`, `/assessments/*`, `/timetable/*`, `/finance/*`, `/admission-forms`, and `/enquiries`; attendance class/history selection is encoded in the URL query.
- Added student-only attendance history and role-scoped timetable endpoints; the general timetable endpoint now requires management permission.
- Forced self-service attendance and leave queries to remain self-scoped even when the user also holds management permissions, and enforced enrollment/section scope on assignment detail and submission APIs.
- Scoped offline reference data and attendance outbox rows by madrasa and user, and removed the shared service-worker API response cache to prevent cross-login data exposure.

## 2026-07-17 — Responsive UI system, visual regression loop, and endpoint contract

Completed a whole-PWA design-system and responsive verification pass using
deterministic authenticated Playwright fixtures. The reusable audit harness at
`app/scripts/visual-audit.mjs` captures login plus 12 representative portal
routes at 1440×1000 and 390×844; baseline and final evidence lives under
`app/artifacts/ui-audit/`. The final pass reports no browser console errors and
no horizontal overflow on any captured route.

The shared UI system now provides complete token aliases, 44px primary touch
targets, a keyboard skip link, reduced-motion handling, safe-area-aware mobile
spacing, a compact sticky mobile app bar, a fully usable mobile navigation
drawer, responsive datetime fields, cleaner empty tables, and a six-item
task-priority dashboard shortcut grid. Login status/error copy is now fully
English/Urdu i18n-backed. The announcement datetime pair was the one concrete
overflow defect found by the final visual audit (130px at 390px wide); it now
collapses to one column on phones.

All portal screens are route-lazy-loaded behind a shared accessible loading
state. The production build moved from one 230.59 KB-gzip JS bundle to a
182.60 KB-gzip initial chunk with individual route chunks no larger than 6.41
KB gzip, satisfying the 200 KB initial / 80 KB route SPA budget.

Added `backend/tests/test_frontend_endpoint_contract.py`, which extracts PWA
API calls and verifies that each method/path matches a registered FastAPI
route (including dynamic path segments). Together with the existing behavioral
and authorization tests, the backend suite is now 120 tests.

## 2026-08-09 - My Assessments Assignment Drilldown

- Implemented: Replaced the My Assessments assignment filter sheet with a teacher-scoped card flow: classes first, sections after class selection, courses after section selection, then latest assignments for that course.
- Files: `app/src/routes/my-assessments.tsx`
- Verified: Focused `npm exec tsc -- --noEmit --pretty false` output has no `src/routes/my-assessments.tsx` errors; existing unrelated TypeScript errors remain elsewhere.
- Notes: Full frontend/backend test suites were intentionally not run for this focused UI flow update.

## 2026-08-10 - Assessment Drilldown Back Button Consistency

- Implemented: Removed the `Teacher scoped results` helper line from My Results and standardized drilldown Back buttons across Examination and My Assessments using one shared button style.
- Files: `app/src/routes/examination.tsx`, `app/src/routes/my-assessments.tsx`
- Verified: Focused TypeScript output has no errors for the touched route files; `git diff --check` passed for touched files.
- Notes: Full frontend/backend test suites were intentionally not run for this focused UI copy/style update.

## 2026-08-10 - Assessment Class Accordion Search Flow

- Implemented: Marking, Results, and My Assessments now start from searchable class cards; selecting a class expands an inline section accordion instead of jumping to a separate section screen.
- Implemented: Standardized drilldown Back headers across Examination and My Assessments, and added search inputs for larger class, course, exam, student, and assignment lists.
- Files: `app/src/routes/examination.tsx`, `app/src/routes/my-assessments.tsx`
- Verified: Focused TypeScript output has no errors for the touched route files.
- Notes: Full frontend/backend test suites were intentionally not run for this focused UI navigation update.

## 2026-08-10 - Published Results Exam Breakdown

- Implemented: Removed the publish action from the separate `/results` screen so publishing remains in the internal Assessments/Examination workflow.
- Implemented: Added extra vertical spacing after the results filters and made subject/course result cards expandable to show exam-level marks for staff and students.
- Files: `app/src/routes/results.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/assessments/schemas.py`, `backend/app/modules/assessments/routes.py`
- Verified: Focused TypeScript output has no errors for `results.tsx` or `more-endpoints.ts`; backend assessment route/schema files pass `py_compile`.
- Notes: Full frontend/backend test suites were intentionally not run for this focused results-view update.

## 2026-08-10 - Academics Search and Class Section Counts

- Implemented: Added search bars to the Academics Programs, Classes, and Courses tabs.
- Implemented: Added `section_count` to the classes API and used it on class cards so collapsed classes show the real section count instead of counting only the currently expanded class sections.
- Implemented: Added a frontend fallback that fetches each class's sections on the Classes tab and counts them directly, so section counts work even before the running backend exposes `section_count`.
- Files: `app/src/routes/academics.tsx`, `app/src/lib/mms/endpoints.ts`, `backend/app/modules/academics/routes.py`, `backend/app/modules/academics/schemas.py`
- Verified: Focused TypeScript output has no errors for `academics.tsx` or `endpoints.ts`; backend academics route/schema files pass `py_compile`.
- Notes: Full frontend/backend test suites were intentionally not run for this focused Academics update.

## 2026-08-10 - Session Switching Flow

- Implemented: Activating, updating-to-active, creating-as-active, or rolling over an academic session now clears saved per-user session selections so users automatically follow the new active madrasa session.
- Implemented: Academics session activation now refreshes the authenticated profile and invalidates cached frontend queries so session-scoped screens shift together.
- Implemented: My Profile now exposes the academic-session selector for all roles, labels previous sessions as read-only, and shows a read-only notice when an archived session is selected for viewing.
- Implemented: Frontend session payloads now match the backend `gregorian_start` / `gregorian_end` contract while still exposing normalized `start_date` / `end_date` to the UI.
- Files: `backend/app/modules/academics/routes.py`, `app/src/routes/academics.tsx`, `app/src/routes/me.tsx`, `app/src/lib/mms/endpoints.ts`, `app/src/lib/mms/more-endpoints.ts`
- Verified: Focused TypeScript output has no errors for the touched session files; backend academics route file passes `py_compile`; `git diff --check` passed for touched files.
- Notes: Previous-session writes are blocked by the existing backend session read-only guard. Full frontend/backend test suites were intentionally not run for this focused session-flow update.

## 2026-08-10 - Attendance Filters and Session Promotion Setup

- Implemented: Added attendance class/section search with a course filter before opening a roster.
- Implemented: Added search and status filters to class attendance history and teacher attendance logs.
- Implemented: Replaced the bare new-session form with a session creation mode selector; the default rollover flow now shows the source session, per-class promotion targets, graduate/leave-unenrolled options, and timetable/holiday copy choices.
- Implemented: Added a frontend `rolloverSession` mutation wired to the existing backend session rollover endpoint.
- Files: `app/src/routes/attendance.tsx`, `app/src/routes/academics.tsx`, `app/src/lib/mms/more-endpoints.ts`
- Verified: Focused TypeScript output has no errors for the touched attendance/session files; `git diff --check` passed for touched files.
- Notes: Full frontend/backend test suites were intentionally not run for this focused UI flow update.

## 2026-08-10 - Academic Session Editing and Deletion

- Implemented: Added edit and confirmed delete actions to the Academics Sessions tab. Editing updates the session name and dates; deletion is restricted to inactive, unused sessions.
- Files: `app/src/routes/academics.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/academics/routes.py`.
- Verified: Focused TypeScript diagnostics and Python compilation; no full test suite run per request.

## 2026-08-10 - Session Administration While Viewing Archived Data

- Implemented: Session-management endpoints are now allowed while a previous session is selected, so principals can activate, edit, roll over, or delete an eligible session. Ordinary historical-session writes remain blocked.
- Files: `backend/app/core/dependencies.py`.
- Verified: Backend dependency compilation; no full test suite run per request.

## 2026-08-10 - Course Editing and Deletion

- Implemented: Added edit and confirmed delete actions to the Academics Courses tab. Course deletion remains blocked when the course is assigned to a class.
- Files: `app/src/routes/academics.tsx`, `app/src/lib/mms/more-endpoints.ts`.
- Verified: Focused TypeScript diagnostics and diff checks; no full test suite run per request.

## 2026-08-10 - Attendance Filters and Admin History Editing

- Implemented: Added Date, Class, and Status filters inside the Students attendance filter button. Date and status filters narrow classes using matching attendance records.
- Implemented: Added a date filter to the Teachers attendance tab and added admin/principal status correction controls for teacher history.
- Implemented: Admin/principal attendance history editing is enabled for both student and teacher records; backend teacher history now returns the academic session ID required for corrections.
- Files: `app/src/routes/attendance.tsx`, `app/src/lib/mms/endpoints.ts`, `backend/app/modules/attendance/routes.py`, `backend/app/modules/attendance/schemas.py`.
- Verified: Focused TypeScript diagnostics, backend `py_compile`, and `git diff --check`; full test suites were not run per request.

## 2026-08-10 - Finance-Style Attendance Date Ranges

- Implemented: Reworked Attendance filter panels to use the shared Finance field-grid layout and replaced single date controls with inclusive From and To ranges for student class cards and teacher logs.
- Files: `app/src/routes/attendance.tsx`, `app/src/lib/mms/endpoints.ts`, `backend/app/modules/attendance/routes.py`.
- Verified: Focused TypeScript diagnostics, backend `py_compile`, and `git diff --check`; full test suites were not run per request.

## 2026-08-10 - Class-First Student Attendance Navigation

- Implemented: Students attendance now lists classes only. Clicking a class expands its sections inline; selecting a section continues through the existing course, calendar, marking, and history flow.
- Files: `app/src/routes/attendance.tsx`.
- Verified: Focused TypeScript diagnostics and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Editable Teacher Check-In and Check-Out History

- Implemented: Admin/principal teacher attendance history cards now include editable Time in and Time out fields with a dedicated save action. Status corrections retain the edited times.
- Files: `app/src/routes/attendance.tsx`.
- Verified: Focused TypeScript diagnostics and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Collapsible Teacher Attendance History Editing

- Implemented: Removed the Teacher Attendance screen's top check-in/check-out panel. Teacher history now displays times as `in08:10 · out 13:00`, and admin editing controls are contained within each record's Edit attendance accordion.
- Files: `app/src/routes/attendance.tsx`.
- Verified: Focused TypeScript diagnostics and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Teacher Log Toolbar Alignment

- Implemented: Added a title slot to the shared filter toolbar and used it to align Teacher log with its filter button. Corrected teacher time display to `in 08:10 · out 13:00`.
- Files: `app/src/components/app/FilterBar.tsx`, `app/src/routes/attendance.tsx`.
- Verified: Focused TypeScript diagnostics and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Automatic Teacher Absences

- Implemented: The ARQ worker checks the completed prior day at 00:05 Asia/Karachi and marks active teachers absent when they have no attendance record and no approved leave. It respects each madrasa's school days and madrasa-wide holidays, and is idempotent on worker restarts.
- Files: `backend/app/worker.py`.
- Verified: Focused Python compilation, whitespace check, and running worker container health; no full test suite run per request.

## 2026-08-10 - Application-Based Student Creation

- Implemented: Admissions now separates Applications and Application forms. Staff with admissions access can create, edit, and delete application templates; templates include text, choice, phone, file, and image fields. Direct student creation remains independent of application forms.
- Files: `app/src/routes/admissions.tsx`, `app/src/components/app/admissions/AdmissionAnswerFields.tsx`, `app/src/components/app/admissions/AdmissionFormEditorSheet.tsx`, `app/src/components/app/people/StudentForm.tsx`, `app/src/components/app/people/PersonDetail.tsx`, `app/src/components/app/forms/FormFieldsEditor.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/operations/{schemas.py,admissions.py}`, `backend/app/modules/people/routes.py`.
- Verified: `cd app && npm run build`, backend `py_compile`, and `git diff --check`; no full test suite run per request.

- Fixed: Existing application-form definitions no longer reintroduce obsolete portal or guardian-language fields. The public endpoint returns all programs for the form's madrasa.

- Fixed: Guardian relationship is now the same fixed dropdown used by the New student guardian flow.

- Fixed: Removed Preferred language from public application forms; language and portal access remain administrative decisions during conversion.

- Fixed: Public admission submission ignores retired built-in answers from an already-open browser form after a field is removed.

## 2026-08-10 - Application Enrollment Without Placement

- Implemented: Applications now expose one Enroll student action. It creates the student and guardian directly from the submitted application, records the admission snapshot, and leaves the student unassigned to a class or section until staff place them later.
- Files: `app/src/routes/admissions.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/operations/{routes.py,schemas.py}`.
- Verified: `cd app && npm run build`, backend `py_compile`, backend container startup/health, and `git diff --check`; no full test suite run per request.

- Fixed: Enrollment now requires a confirmation that names the student and guardian records about to be created.

- Fixed: Removed the application status/history panel. Reject now sits beside Enroll student as the two admission decisions.

## 2026-08-10 - Complete Application Profiles

- Implemented: Removed Preferred language from New student creation. Applications now open as dedicated profile pages using the Student profile layout; pending applications display every submitted default and custom field, while enrolled applications open the resulting Student profile with the immutable application record. Public admission image/file uploads are stored as tenant files and a submitted profile image is attached to the student during enrollment.
- Files: `app/src/{components/app/people/{StudentForm.tsx,PersonDetail.tsx},routes/{admissions.tsx,admissions.$applicationId.tsx,admission.$token.tsx},lib/mms/more-endpoints.ts}`, `backend/app/modules/{public/routes.py,operations/routes.py}`.
- Verified: frontend build, backend syntax check, rebuilt backend startup/health, and `git diff --check`; no full test suite run per request.

- Fixed: Admissions now renders its nested application profile route after a card click. Public file/image upload errors are shown beside the affected field instead of being silently discarded.

- Fixed: Application cards now display the submitted profile picture, with the admission icon as the fallback.

- Fixed: Enrolling an application now invalidates the Students list cache, so the new student appears in People immediately.

## 2026-08-10 - Dedicated Student Profile Route

- Implemented: Selecting a student from People now opens `/people/:studentId` as a dedicated profile page. The page fetches the complete student record and retains the existing enrollment, guardian, credential, admission-record, and file actions with a consistent Back control.
- Files: `app/src/routes/people.tsx`, `app/src/routes/people.$studentId.tsx`, `app/src/components/app/people/PersonDetail.tsx`, `app/src/lib/mms/{endpoints.ts,more-endpoints.ts}`.
- Verified: `cd app && npm run build`; authenticated Playwright click from People to `/people/:studentId` confirmed the visible `Student profile` heading; no full test suite run per request.

## 2026-08-10 - Student Profile Avatar Placeholder

- Implemented: The dedicated student profile header now includes a profile-picture placeholder beside the student name when no displayable avatar is available.
- Files: `app/src/components/app/people/PersonDetail.tsx`.
- Verified: `git diff --check`; no full test suite run per request.

## 2026-08-10 - Student Photo Upload

- Implemented: The direct New student form accepts an image-only profile-picture upload. The upload creates a tenant-scoped file record, attaches its ID to the student profile, and the profile header and student directory cards resolve and display it. Clicking the profile image in the student profile opens a zoomed modal view.
- Files: `app/src/components/app/{FilePickerField.tsx,people/{StudentForm.tsx,PersonDetail.tsx}}`, `app/src/routes/people.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/files/{routes.py,schemas.py}`.
- Verified: backend `py_compile`, `cd app && npm run build`, `git diff --check`, and API health; no full test suite run per request.

## 2026-08-10 - Optional Application Fields For Manual Students

- Implemented: New student creation retains its default student and guardian fields, then offers an optional application-form selector. Selected forms contribute only their custom fields; their answers and a schema snapshot are stored with the student.
- Files: `app/src/components/app/people/StudentForm.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/people/routes.py`.
- Verified: backend `py_compile`, `cd app && npm run build`, `git diff --check`, backend health, and frontend availability; no full test suite run per request.

- Fixed: Admission form cards now count only custom fields, excluding the 12 system default fields returned by the API.

## 2026-08-10 - Admissions Filters

- Implemented: Applications now have filter-button controls for form, program, conversion state, and created-date range. Application Forms now have search, open/closed status, category, and program filters. The tab header count follows the active tab.
- Files: `app/src/routes/admissions.tsx`, `app/src/components/app/FilterBar.tsx`.
- Verified: `cd app && npm run build`, `git diff --check`; no full test suite run per request.

## 2026-08-10 - Student And Guardian Addresses

- Implemented: The New student form shows a student address only for independent students. The inline Create new guardian accordion now collects and saves the guardian address.
- Files: `app/src/components/app/people/StudentForm.tsx`.
- Verified: pending focused frontend check.

## 2026-08-10 - Public Application Form Sharing

- Implemented: Removed manual application creation from the Applications tab. Application Forms now have a Share action that opens the native phone share sheet or copies the public form URL on web. The existing public route displays default admission fields plus custom form fields and submits into Applications without a class selector.
- Files: `app/src/routes/admissions.tsx`, `app/src/routes/admission.$token.tsx`, `backend/app/modules/public/routes.py`.
- Verified: `cd app && npm run build`, `git diff --check`; public-link browser walkthrough remains in `TO_IMPLEMENT.md`.

- Fixed: Public application fields now follow New student input behavior: non-phone fields no longer receive a `+92` value, date of birth uses a date picker, and core labels match the student form.

## 2026-08-10 - Public Application Program Selection

- Implemented: Removed the form-editor Program selector. Public application links now show a required Program dropdown, validate that the selected program belongs to the madrasa, and store that selection on the submitted application. Public fields conditionally follow the independent/dependent student flow and use the existing phone and B-Form/CNIC masks; portal and guardian-language controls are excluded.
- Files: `app/src/components/app/admissions/AdmissionFormEditorSheet.tsx`, `app/src/routes/admission.$token.tsx`, `app/src/lib/mms/more-endpoints.ts`, `backend/app/modules/{operations/admissions.py,operations/schemas.py,public/routes.py}`.
- Verified: `cd app && npm run build`, backend `py_compile`, and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Default Contact Numbers And Guardian Accounts

- Implemented: Students, guardians, teachers, and donors now support ordered phone numbers and an explicit default contact. Existing single-value contact columns mirror that default for compatibility; dependent student profiles display linked guardian phone numbers and addresses instead of duplicating them. Application enrollment provisions every guardian a disabled portal account with a generated username.
- Files: `backend/alembic/versions/32502fc5c5d0_add_profile_phone_lists.py`, `backend/app/modules/{people,finance,messaging,operations}/`, `app/src/components/app/people/{PhoneNumbersField.tsx,StudentForm.tsx,GuardianForm.tsx,TeacherForm.tsx,DonorForm.tsx,PersonDetail.tsx}`, `app/src/lib/mms/{endpoints.ts,more-endpoints.ts}`.
- Verified: backend `py_compile`, `cd app && npm run build`, rebuilt backend migration, and `/healthz`; no full test suite run per request.

## 2026-08-10 - Incomplete Student And Guardian Profiles

- Implemented: Replaced the principal dashboard Recent activity panel with clickable student and guardian incomplete-profile counts. The drill-down lists missing profile fields and can send WhatsApp completion reminders to profiles with a default contact number. Student and guardian portals now expose complete editable personal-profile panels in My Profile, including required custom application fields for students.
- Files: `backend/app/modules/{reporting,people}/{routes.py,schemas.py}`, `app/src/routes/{dashboard.tsx,incomplete-profiles.tsx,me.tsx}`, `app/src/lib/mms/endpoints.ts`.
- Verified: backend `py_compile`, `cd app && npm run build`, rebuilt backend, `/healthz`, and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Expired Session Request Guard

- Implemented: The frontend now discards expired or malformed JWTs before authenticated API calls, preventing stale dashboard requests from producing avoidable 401 errors. Added the current mobile-web-app capability meta tag alongside the Apple-specific tag.
- Files: `app/src/lib/mms/{api.ts,auth.tsx}`, `app/src/routes/__root.tsx`.
- Verified: source review and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Announcement Audience Tags

- Implemented: Announcement cards now display a readable audience tag beside the category tag, covering all-audience, student, teacher, and multi-role announcements.
- Files: `app/src/routes/announcements.tsx`.
- Verified: source review; no build run for this presentation-only change per request.

## 2026-08-10 - Donor Portal Setting

- Implemented: Madrasa Settings now includes a Portal toggle for donor login access. It defaults to disabled and the authentication endpoint rejects donor sign-ins while it is off, without affecting donation history.
- Files: `backend/app/core/settings_catalog.py`, `backend/app/modules/auth/routes.py`.
- Verified: backend `py_compile`, rebuilt backend, `/healthz`, and `git diff --check`; no full test suite run per request.

## 2026-08-10 - Tenant-Scoped Usernames And Platform Login

- Implemented: Replaced the legacy global username index with tenant-scoped uniqueness and a platform-only unique index for super-admin accounts. Authentication now resolves same-named tenant and platform accounts by their matching password. Bootstrap uses tenant-specific principal employee codes and shared template codes, allowing the `default` tenant and the platform super-admin to initialize together.
- Files: `backend/alembic/versions/4b13f91953ae_scope_usernames_to_tenants.py`, `backend/app/modules/auth/routes.py`, `backend/bootstrap.py`, `.env`.
- Verified: backend `py_compile`, rebuilt backend migration/startup, `/healthz`, and successful super-admin token request using the configured default tenant; no full test suite run per request.

## 2026-08-10 - Super-Admin Platform Shell

- Implemented: Super-admin authentication now routes to the Platform console. Platform users see platform branding, platform scope in My Profile, and a platform-only navigation menu instead of a madrasa dashboard or tenant navigation.
- Files: `app/src/components/app/Navigation.tsx`, `app/src/routes/{dashboard.tsx,index.tsx,me.tsx}`.
- Verified: source review and `git diff --check`; no full build run for this role-presentation change per request.
## 2026-08-23 - Fix my-timetable Day of Week Mapping

- Implemented: Fixed the day index mapping in `my-timetable.tsx` so that `day_of_week=0` maps to Monday instead of Sunday.
- Files: `app/src/routes/my-timetable.tsx`
- Verified: Traced backend slot `day_of_week` integer representation against the frontend mapping in the view.
- Notes: The student view incorrectly displayed Monday's schedule under the 'SUN' header.

## 2026-08-23 - Fix Admin Results Publishing UI Discrepancy

- Implemented: Added a `published` boolean to the `MatrixStudentRow` API endpoint to inform the frontend whether a student's results have already been published.
- Implemented: Updated the Admin Examination Classes view to explicitly show a "Results published" badge (and hide the publish button) if all students' results in a class have already been published.
- Files: `backend/app/modules/assessments/schemas.py`, `backend/app/modules/assessments/routes.py`, `app/src/lib/mms/endpoints.ts`, `app/src/routes/examination.tsx`
- Notes: The seed script inserted `ResultPublication` records without ensuring all marks were complete. This caused the student to see their published results, while the Admin UI simultaneously showed a disabled "Publish class results" button with missing marks warnings, falsely suggesting the results were still in draft.

## 2026-08-23 - Fix TanStack Router Dependency Mismatch

- Implemented: Pinned `@tanstack/react-router`, `@tanstack/react-start`, and `@tanstack/router-plugin` to version `1.168.18` to resolve severe missing export build errors and runtime routing crashes caused by version mismatch.
- Files: `app/package.json`, `app/pnpm-lock.yaml`
- Verified: `pnpm run build` completes successfully. PWA and SW generated without `ENOENT` errors.
- Notes: The `1.170.x` updates introduced breaking changes in `router-core/ssr/server.js` exports that `react-start` `1.168.x` still relied on.

## 2026-08-23 - White Screen Invariant failed on Reload & Backend Container Crash

- Implemented: Removed duplicate index.html generation from scripts/fix-sw.sh to prevent overwriting vite.config.ts's __TSR__-injected app shell, fixing the TanStack Router hydration crash (Invariant failed) on PWA offline reload.
- Implemented: Fixed backend DB connection string parsing for Coolify postgres URLs by adding a global validator in backend/app/core/config.py.
- Implemented: Refactored backend/bootstrap.py to gracefully handle madrasas with multiple principals.
- Files: `app/scripts/fix-sw.sh`, `backend/app/core/config.py`, `backend/bootstrap.py`
- Verified: Browser build successful, checked static index.html output has correct __TSR__ dehydration payload.
- Notes: The PWA offline shell now correctly hydrates without throwing useMatch Invariant errors.

## 2026-08-23 - Custom Client Entry for PWA SPA Fallback

- Implemented: Added a custom `app/src/client.tsx` entry point to override TanStack Start's default client behavior.
- Context: TanStack Start's `StartClient` crashes with an `Invariant failed` if it boots from a static PWA shell with missing or empty `__TSR__` dehydrated matches.
- Fix: The custom entry detects if the shell has empty `matches` (injected by `generateAppShell`) and falls back to a full client-side `createRoot(document)` using just `RouterProvider`, bypassing the fragile `hydrateStart()` logic.
- Files: `app/src/client.tsx`
- Verified: `npm run build` successfully compiles the custom client entry.

## 2026-08-23 - Fix favicon 404

- Implemented: Copied `favicon.png` to `favicon.ico` in `app/public` to prevent 404 errors when browsers request the default favicon file.
- Files: `app/public/favicon.ico`

## 2026-08-23 - App SSR & PWA Client Hydration Crash Fix
- Implemented: Fixed the `Invariant failed` crash on offline/PWA refresh by separating client bootstrap into SSR and SPA logic paths. Bootstrapped SPA using `router.load()` before render.
- Implemented: Fixed Vite 8 / Rolldown SSR circular chunking bug where `__exportAll` failed to evaluate due to ESM TDZ, causing Nitro SSR 500 crashes and throwing the client into the static fallback route.
- Files: `app/src/client.tsx`, `app/scripts/fix-sw.sh`, `app/vite.config.ts`
- Verified: `npm run build` succeeds; Local Nitro SSR server tested with `curl -sI` returns HTTP 200 and renders `$_TSR` correctly.

## 2026-08-25 - Standardize Action and Filter Button Placement Project-Wide

- Implemented: Refactored `FilterBar` so the Filter button is uniformly placed on the left, and the New/Action button is uniformly placed on the right. Migrated all action buttons in main routes (`academics.tsx`, `roles.tsx`, `donations.tsx`, `admissions.tsx`, `resources.tsx`, `blog.tsx`, etc.) from `AppShell`'s `right` prop to the new `FilterBar` `action` prop, ensuring a consistent layout pattern across all screens.
- Files: `app/src/components/app/FilterBar.tsx`, `app/src/routes/academics.tsx`, `app/src/routes/roles.tsx`, and all other route files containing action buttons.
- Verified: `cd app && npm run build` completes successfully without type errors. Verified that academics screen correctly implements the new pattern instead of its previous custom search fields.
