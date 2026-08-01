# Suffa-MS Full PWA Visual Redesign Proposal

## Summary
Redesign the React/Vite PWA as a modern operational app, mobile-first and desktop-clean, while preserving existing routes, permissions, API behavior, MUI v9, lucide icons, i18n, RTL, and PWA tooling.

The redesign should not proceed as isolated screen fixes. First rebuild the shared UI foundation, then migrate screens in batches so mobile, compact tablet, desktop, English, and Urdu/RTL all follow one coherent system.

## Key Changes
- Define one responsive contract:
  - Phone: `<768px`, top app bar + bottom tabs + full drawer.
  - Compact tablet: `768-959px`, mobile-style navigation and no permanent sidebar.
  - Desktop: `>=960px`, permanent sidebar and denser content.
- Upgrade shared primitives in `app/src/components/ui/`:
  - `Page`, `PageHeader`, `PageToolbar`, `ResponsiveTabs`, `PageSurface`, `ResponsiveStack`, `StickyMobileActions`.
  - `Modal/FormModal` with sane desktop dialog sizing and mobile bottom-sheet/fullscreen behavior.
  - One responsive filter system replacing split `InlineFilter`/`FilterBar` behavior.
  - One responsive records system: desktop tables, mobile cards, compact-tablet no-overflow layouts.
  - Shared `DetailList` for profile/detail modals instead of repeated raw `dl` grids.
- Apply a restrained visual system:
  - Cards/page surfaces use tighter radii around `8px`.
  - Dialogs use controlled `12px` desktop radius and top-corner-only mobile sheets.
  - Keep desktop screens dense and scannable; make mobile screens task-focused with reachable actions.
- Keep route/access control centralized in `app/src/data/mockData.ts`; do not move permission logic into visual components.

## Implementation Order
1. **Baseline Audit**
   - Capture current screenshots for the main principal, teacher, student, guardian, super-admin, and public routes.
   - Check `320`, `390`, `768`, `920`, and `1440px` in English and Urdu/RTL.
   - Record overflow, clipped text, broken modals, mixed desktop/mobile patterns, and raw table exceptions.

2. **Foundation Pass**
   - Fix `Modal/FormModal` first, including the shown “Add program” oversized rounded modal issue.
   - Normalize theme tokens, page layout primitives, form rows/actions, data cards/tables, tabs, filters, and action placement.
   - Preserve or update visual-test hooks alongside component changes.

3. **Shell And Navigation Pass**
   - Refactor `App.tsx`, `Sidebar`, `NavDrawer`, `BottomTabBar`, `AppBar`, `InstallPrompt`, and `PwaStatus` onto the shared breakpoint/safe-area contract.
   - Ensure RTL drawer behavior, active states, chevrons, labels, and bottom spacing work at `390px` and `920px`.

4. **High-Traffic Screens**
   - Migrate `DashboardCards`, `PeopleView`, `AcademicsView`, `AttendanceBoard`, and `TimetableView`.
   - Prioritize tabs, filters, create/edit/detail modals, data lists, action menus, and mobile task flows.

5. **Admin And Workflow Screens**
   - Migrate `AssessmentsView`, `AdmissionsView`, `FinanceView`, `SalaryView`, `FormsView`, and `ReportsView`.
   - Convert normal record lists to shared table/card primitives.
   - Keep true matrix views in a dedicated responsive matrix component with documented exceptions.

6. **Secondary And Public Screens**
   - Migrate `ResourcesView`, `AnnouncementsView`, `HolidaysView`, `LeaveView`, `SettingsView`, `ProfileView`, `LoginScreen`, `SetPasswordPage`, `PublicAdmissionPage`, and `PlatformView`.
   - Remove leftover local layout helpers, duplicate styled components, unused imports, and orphan code.

7. **Documentation**
   - Update `IMPLEMENTED.md` after each completed batch with files, routes, verification commands, and screenshot locations.
   - Update `TO_IMPLEMENT.md` only for deferred matrix exceptions, known route gaps, or release blockers.

## Tests And Acceptance
- Run after foundation/shell changes:
  - `cd app && npm run build`
  - `npm run test:i18n`
  - `npm run test:foundation-components`
  - `npm run test:route-runtime`
  - `npm run test:dialogs`
  - `npm run test:drawer`
- Run after each route batch:
  - `npm run test:mobile-records`
  - `npm run test:students-layout`
  - `npm run test:visual-issues`
  - `npm run test:appwide-visual`
- Final release gate:
  - `npm run test:mobile-pwa`
  - Browser screenshots reviewed at `320`, `390`, `768`, `920`, `1440px`, English and Urdu/RTL.
- Acceptance criteria:
  - No page-level horizontal overflow.
  - No clipped button/input/modal text.
  - No overlapping fixed app bar, drawer, bottom tabs, or sticky action bars.
  - Dialogs fit viewport and actions remain reachable.
  - Every visible action works from the surface where it appears.
  - No raw mobile tables except documented matrix exceptions.
  - All user-facing strings remain translated in English and Urdu.

## Assumptions
- This proposal targets the PWA in `app/`; backend/API work is out of scope unless a UI journey exposes a missing field or contract issue.
- The public admission/auth screens are included because they are part of the PWA route surface.
- Full visual redesign means changing the visual language and reusable layout system, but not changing product behavior, route permissions, or existing custom flows.
