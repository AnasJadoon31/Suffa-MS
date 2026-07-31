# UI Overhaul — Suffa-MS

**Goal ID:** UI-OVERHAUL-2026-07-31
**Created:** 2026-07-31T07:35:00Z

## Overview

Fix 8 critical UI issues identified across the Suffa-MS portal: margins/spacing, drawer full-width items, attendance marking flow, tab prominence, action menu visibility, period filtering, holiday display format, and card-vs-table consistency.

## Implementation Plan

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

## Auto-Continue Directive

**Mode:** Automatic (no user confirmation between phases)

The system MUST automatically proceed through each phase of the implementation plan above without stopping to ask for user confirmation. When one phase completes, the system MUST immediately begin the next phase, picking up where the previous phase left off.

### Chat Session Continuation

The system MUST automatically continue the chat session between phases. Each phase transition MUST be seamless — the system carries forward all context, decisions, and artifacts from the previous phase without requiring the user to re-orient or re-approve continuation.

### Stopping Conditions

The system MUST only halt execution when one of the following conditions is met:

1. **Goal Fully Implemented** — all phases in the implementation plan are complete and the goal's acceptance criteria are satisfied.
2. **Blocker Requiring Human Intervention** — the system encounters an issue it cannot resolve autonomously (e.g., ambiguous requirements, missing credentials, conflicting constraints, or an external dependency failure). In this case, the system MUST clearly describe the blocker, what was attempted, and what human input is needed.

The system MUST NOT stop for any other reason, including:

- Phase completion (automatically proceed to the next phase)
- Minor uncertainties (make a reasonable decision and document it)
- Routine decisions within the scope of the plan

## Dependencies

- `plans/ui-overhaul-proposal.md` — detailed fix proposal
- Existing components: NavDrawer, AttendanceBoard, HolidaysView, AcademicsView, ActionMenu, FilterBar, PageSection

## References

- `plans/ui-overhaul-proposal.md`
- `app/src/components/NavDrawer.tsx`
- `app/src/components/AttendanceBoard.tsx`
- `app/src/components/HolidaysView.tsx`
- `app/src/components/AcademicsView.tsx`
- `app/src/components/ui/ActionMenu.tsx`
- `app/src/components/ui/FilterBar.tsx`
- `app/src/components/ui/Layout.tsx`
