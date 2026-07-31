# UI Overhaul Proposal — Suffa-MS

## Issue 1: No Left/Right Margins (Suffocated Text)

**Root Cause:** The `NavItemButton` in `NavDrawer.tsx` has `marginInline: 6` which adds horizontal margin inside the drawer items, but the `ListItem` uses `disablePadding` and the `NavLinkWrapper` doesn't stretch full-width. The `PageSection` component wraps content in a `Paper` with `p: 2.5` but the inner content has no additional breathing room.

**Fix:**

- Remove `marginInline: 6` from `NavItemButton` — let items stretch edge-to-edge in the drawer
- Add `px: 2` to the `List` component in NavDrawer for consistent left/right padding
- Increase `PageSection` padding to `p: { xs: 2, sm: 3 }` for better breathing room
- Add `gap: 2` between `PageSection` children for better vertical spacing

---

## Issue 2: Menu Items Not Full Width in Drawer

**Root Cause:** The `NavItemButton` has `marginInline: 6` which creates gaps on left/right. The `NavLinkWrapper` is `display: block` but doesn't have `width: 100%`. The `ListItem` has `disablePadding` but no explicit width.

**Fix:**

- Remove `marginInline: 6` from `NavItemButton` style
- Add `width: "100%"` to `NavLinkWrapper`
- Add `px: 1.5` to the parent `List` for consistent edge padding
- Ensure `NavItemButton` has no horizontal margin constraints

---

## Issue 3: Unable to Mark Attendance

**Root Cause:** Multiple issues in `AttendanceBoard.tsx`:

1. The `showMarkForm` requires `isSelectedToday` — if user selects a different day, they can't mark
2. The period dropdown only shows slots for the selected course, but doesn't filter by day of week
3. The roster only loads when `selectedSlotId` is set, but the slot selection is confusing
4. The `FilterBar` select fix is correct, but the UX flow is: select class → select course → select period → then see roster. This is too many steps.

**Fix:**

- Show the roster as soon as a class + course is selected (remove slot requirement for initial view)
- Default the period to the current day's slot automatically
- Show a clear "Mark Today's Attendance" button when on today's date
- Simplify the flow: Class → Course → auto-select today's period → show roster
- Add a prominent "Mark Attendance" button at the top when class+course are selected

---

## Issue 4: Tabs Should Be Prominent (Mobile App Style)

**Root Cause:** The `TabButton` component in `AcademicsView.tsx` uses the shared `Button` component which is small and not touch-friendly. Tabs are rendered as small buttons in a flex row.

**Fix:**

- Create a new `MobileTabs` component styled like mobile app tabs (bottom navigation style)
- Use `BottomTabBar` pattern: large touch targets (min 48px), icons + labels, active state with filled background
- For desktop: use larger `TabButton` with `minHeight: 48px`, `px: 3`, and bolder active state
- Use `ToggleButtonGroup` for a more prominent tab switcher
- Add visual indicator (underline or background highlight) for active tab

---

## Issue 5: Options Hidden Beneath Arrow (ActionMenu)

**Root Cause:** The `ActionMenu` component hides all actions behind a dropdown arrow. For tables with few actions (2-3), this adds unnecessary friction.

**Fix:**

- For rows with ≤ 2 actions: render them as inline buttons directly in the table row
- For rows with > 2 actions: keep the ActionMenu but make it a "More" button with the primary action visible
- Add a prop `inlineThreshold={2}` to `ActionMenu` — if items ≤ threshold, render inline
- Update all table views (PeopleView, HolidaysView, AcademicsView, etc.) to use this pattern

---

## Issue 6: Periods Should Only Show When Multiple Periods on Same Day

**Root Cause:** The period dropdown in `AttendanceBoard.tsx` shows ALL timetable slots for the selected course, regardless of day. This is confusing when there's only one period per day.

**Fix:**

- Filter the period dropdown to only show slots for the CURRENT day of the week
- If only one slot exists for today, auto-select it and hide the dropdown
- Only show the period dropdown if there are multiple slots for the same course on the same day
- Add a tooltip explaining why periods are shown/hidden

```tsx
const todayDayOfWeek = new Date().getDay(); // 0=Sunday
const todaysSlots = timetableSlots.filter(
  (slot) => slot.day_of_week === todayDayOfWeek,
);
const showPeriodDropdown = todaysSlots.length > 1;
```

---

## Issue 7: Display Format Broken (Holidays Screen)

**Root Cause:** The `HolidaysView.tsx` uses `DataTable` with inline editing. The `Input` components in table cells are too small. The `HijriTag` rendered inline with dates causes line breaks. The "Applies to" column shows comma-separated class names which overflow.

**Fix:**

- Replace `DataTable` with card-based layout for holidays (like other views)
- Each holiday card shows: name, category, date range (with HijriTag below), applies-to
- Use `DataCard` component for consistent card styling
- Move editing to a modal (already partially done) instead of inline table editing
- Fix date display: show Gregorian date on one line, HijriTag on the next line
- For "Applies to": show "All classes" or first class name + count badge

---

## Issue 8: Tables Where Cards Should Be Used (Programs Screen)

**Root Cause:** The `AcademicsView.tsx` programs tab uses `StyledTableContainer` with `Table` — a dense table layout that's hard to read on mobile.

**Fix:**

- Replace the programs table with a card grid using `ClassGrid`/`ClassCard` pattern (already used in AttendanceBoard)
- Each program card shows: program name, number of classes, actions
- Use responsive grid: `gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"`
- Apply the same pattern to: Courses tab, Sessions tab (already card-like but could be improved)
- Keep tables only for: Classes tab (where the list is the primary content), Sections & Courses mapping

---

## Additional Related Issues Found

### A. Inconsistent Card vs Table Usage

- **PeopleView**: Uses cards ✅
- **AssessmentsView**: Uses cards ✅
- **FinanceView**: Uses cards ✅
- **AcademicsView (programs)**: Uses table ❌ → Should be cards
- **AcademicsView (classes)**: Uses table ✅ (acceptable for list)
- **AcademicsView (courses)**: Uses table ❌ → Should be cards
- **HolidaysView**: Uses table ❌ → Should be cards
- **ResourcesView**: Uses cards ✅
- **FormsView**: Uses table ❌ → Should be cards

### B. FilterBar Mobile Collapse

The `FilterBar` mobile view collapses filters behind a toggle. This hides important filters.

- **Fix**: Show filters as a horizontal scrollable row on mobile, or show the most important filter (first one) always visible with a "More filters" expandable section

### C. Missing Visual Hierarchy

- Page titles are `variant="h5"` but could be larger on mobile
- Section headers (`variant="h6"`) are too small
- **Fix**: Increase to `variant={{ xs: "h6", sm: "h5" }}` for page titles, `variant={{ xs: "body1", sm: "h6" }}` for section headers

### D. Touch Targets Too Small

- `ActionMenu` trigger button is small
- `IconButton` in tables is small
- **Fix**: Ensure all interactive elements have `minWidth: 44px` and `minHeight: 44px`

---

## Implementation Priority

### Phase 1: Quick Wins (High Impact, Low Effort)

1. Fix NavDrawer full-width items + margins
2. Fix PageSection padding/spacing
3. Fix HolidaysView card layout
4. Fix AcademicsView programs → cards
5. Fix ActionMenu inline threshold

### Phase 2: Attendance Flow (High Impact, Medium Effort)

6. Fix attendance marking flow (simplify period selection)
7. Fix period dropdown to filter by current day
8. Add prominent "Mark Today's Attendance" button

### Phase 3: Tab & Navigation Polish (Medium Impact, Medium Effort)

9. Redesign tabs to be prominent/mobile-app style
10. Fix FilterBar mobile visibility
11. Increase touch targets globally

### Phase 4: Consistency Pass (Medium Impact, High Effort)

12. Convert remaining tables to cards (courses, forms)
13. Standardize visual hierarchy (typography, spacing)
14. Add responsive grid layouts everywhere
