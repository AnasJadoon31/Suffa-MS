# UI Issues Fix Proposal — Suffa-MS

## Issue 1: Multiple Recent Activity Cards

**Root Cause:** In `DashboardCards.tsx`, the `ParentDashboardCards` component renders multiple separate `PageSection` cards for related data (fee history, timetable, due assignments, announcements, forms, resources). This creates visual clutter and repetitive cards.

**Fix:**

- Consolidate related sections into a single "Overview" card with tabs or accordion sections
- Use a unified card layout with collapsible sections
- Reduce visual noise by grouping related items

---

## Issue 2: Period Dropdown in Attendance

**Root Cause:** In `AttendanceBoard.tsx`, the auto-select period logic only works when `selectedSlotId` is empty. When switching courses, the old slot ID persists and prevents auto-selection. Also, the period dropdown shows all slots for the course, not just today's slots.

**Fix:**

- Clear `selectedSlotId` when course changes
- Auto-select period when only one slot exists for the selected course on the current day
- Show a clear label when no period is needed (only one slot per day)
- Hide the period dropdown entirely when there's only one slot for today

---

## Issue 3: Modal Desktop View

**Root Cause:** The `Modal` component in `app/src/components/ui/Modal.tsx` likely has a fixed width or max-width that doesn't adapt well to desktop viewports, causing it to look too narrow or centered in an awkward way.

**Fix:**

- Add responsive width: `width: { xs: '90vw', sm: '600px', md: '800px', lg: '1000px' }`
- Add responsive max-width: `maxWidth: { xs: '90vw', sm: '600px', md: '800px', lg: '1000px' }`
- Ensure modal content doesn't overflow on desktop
- Add proper padding for desktop view

---

## Issue 4: Leave Card Format

**Root Cause:** `LeaveView.tsx` uses `DataTable` (line 332) which renders as a dense table. This is inconsistent with the card-based layout used in other views.

**Fix:**

- Replace `DataTable` with card grid using `DataCard` component
- Each leave card shows: person name, type, date range, reason, status
- Status change dropdown should be inline on the card
- Use responsive grid: `gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))"`

---

## Issue 5: Remaining Tables That Should Be Cards

### Files Using `DataTable` (Should be Cards):

| File                  | Current                                     | Fix                                      |
| --------------------- | ------------------------------------------- | ---------------------------------------- |
| `LeaveView.tsx`       | `DataTable`                                 | Replace with `DataCard` grid             |
| `AssessmentsView.tsx` | `DataTable` for assignments                 | Replace with `DataCard` grid             |
| `PeopleView.tsx`      | `DataTable` for teachers/students/guardians | Replace with `DataCard` grid             |
| `ResourcesView.tsx`   | `DataTable`                                 | Replace with `DataCard` grid             |
| `BlogView.tsx`        | `DataTable`                                 | Replace with `DataCard` grid             |
| `ReportsView.tsx`     | `DataTable`                                 | Replace with `DataCard` grid             |
| `AdmissionsView.tsx`  | `DataTable`                                 | Replace with `DataCard` grid             |
| `FinanceView.tsx`     | `DataTable`                                 | Replace with `DataCard` grid             |
| `SalaryView.tsx`      | `DataTable`                                 | Replace with `DataCard` grid             |
| `SettingsView.tsx`    | `DataTable`                                 | Replace with `DataCard` grid             |
| `PlatformView.tsx`    | `DataTable`                                 | Replace with `DataCard` grid             |
| `AcademicsView.tsx`   | `DataTable` for classes/courses/sessions    | Keep tables for these (data-dense lists) |
| `FormsView.tsx`       | `DataTable` for responses                   | Replace with `DataCard` grid             |

### Files Already Using Cards:

- `HolidaysView.tsx` ✅
- `AcademicsView.tsx` (programs tab) ✅
- `FormsView.tsx` (forms tab) ✅
- `AttendanceBoard.tsx` ✅
- `DashboardCards.tsx` ✅

---

## Implementation Priority

### Phase 1: Quick Wins (High Impact, Low Effort)

1. Fix modal responsive width
2. Fix period dropdown auto-selection in attendance
3. Replace `LeaveView.tsx` table with cards

### Phase 2: Table-to-Card Migration (Medium Impact, Medium Effort)

4. Replace `AssessmentsView.tsx` assignments table with cards
5. Replace `PeopleView.tsx` tables with cards
6. Replace `ResourcesView.tsx` table with cards
7. Replace `BlogView.tsx` table with cards

### Phase 3: Consistency Pass (Medium Impact, High Effort)

8. Replace `ReportsView.tsx` table with cards
9. Replace `AdmissionsView.tsx` table with cards
10. Replace `FinanceView.tsx` table with cards
11. Replace `SalaryView.tsx` table with cards
12. Replace `SettingsView.tsx` table with cards
13. Replace `PlatformView.tsx` table with cards
14. Replace `FormsView.tsx` responses table with cards

### Phase 4: Dashboard Polish (Low Impact, Low Effort)

15. Consolidate parent dashboard cards
16. Fix principal dashboard activity section

---

## Files to Modify

| File                                     | Change                                             |
| ---------------------------------------- | -------------------------------------------------- |
| `app/src/components/ui/Modal.tsx`        | Add responsive width                               |
| `app/src/components/AttendanceBoard.tsx` | Fix period auto-selection                          |
| `app/src/components/LeaveView.tsx`       | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/AssessmentsView.tsx` | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/PeopleView.tsx`      | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/ResourcesView.tsx`   | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/BlogView.tsx`        | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/ReportsView.tsx`     | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/AdmissionsView.tsx`  | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/FinanceView.tsx`     | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/SalaryView.tsx`      | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/SettingsView.tsx`    | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/PlatformView.tsx`    | Replace `DataTable` with `DataCard` grid           |
| `app/src/components/FormsView.tsx`       | Replace responses `DataTable` with `DataCard` grid |
| `app/src/components/DashboardCards.tsx`  | Consolidate parent dashboard sections              |

---

## Verification Checklist

- [ ] `cd app && npm run build` passes
- [ ] Modal renders correctly on desktop (1440px) and mobile (390px)
- [ ] Attendance period auto-selects when only one slot exists for today
- [ ] Leave view uses card grid instead of table
- [ ] All migrated views use consistent `DataCard` styling
- [ ] No TypeScript errors
- [ ] No console warnings about missing keys or props
