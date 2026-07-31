# FilterBar Select Regression Fix Plan

## Root Cause

The bug is in `app/src/components/ui/FilterBar.tsx`. The `FilterField` interface correctly defines `type: "text" | "select" | "date"` and includes an `options` array for select fields, but the rendering logic **ignores the `select` type entirely** and renders ALL fields as `<TextField>` (text inputs).

### Buggy Code (lines 170-184 and 194-207):

```tsx
{fields.map((field) => (
  <TextField
    key={field.key}
    size="small"
    type={field.type === "date" ? "date" : "text"}  // ← Only handles date/text, ignores "select"!
    label={field.label}
    placeholder={field.placeholder}
    value={field.value}
    onChange={(e) => field.onChange(e.target.value)}
    ...
  />
))}
```

This means any filter field configured with `type: "select"` renders as a plain text input, forcing users to type UIDs instead of selecting from a dropdown.

## Affected Components

The `FilterBar` component is imported and used in these files:

| File                  | Line | Affected Selectors                                     |
| --------------------- | ---- | ------------------------------------------------------ |
| `AttendanceBoard.tsx` | 804  | Course selector, Period selector                       |
| `FinanceView.tsx`     | 85   | Finance tab switcher (contributions/donations/summary) |
| `FinanceView.tsx`     | 215  | Class filter, Category filter (contributions)          |
| `FinanceView.tsx`     | 482  | Donor filter, Category filter (donations)              |
| `PeopleView.tsx`      | 909  | Student class filter                                   |

## NOT Affected

The `InlineFilter` component (`app/src/components/ui/InlineFilter.tsx`) correctly handles `type: "select"` by rendering a `<Select>` component. Views using `InlineFilter` (AcademicsView, AssessmentsView, TimetableView, FormsView, HolidaysView, AnnouncementsView, LeaveView, ResourcesView, ReportsView) are NOT affected.

## Fix Steps

### Step 1: Update `FilterBar.tsx` to render select fields as dropdowns

In `app/src/components/ui/FilterBar.tsx`, modify the field rendering logic to check `field.type === "select"` and render a `<Select>` component with options instead of a `<TextField>`.

**Desktop fields (lines 170-184):**

- Add a branch: if `field.type === "select"`, render a `<Select>` with `field.options` mapped to `<option>` elements
- Keep existing logic for `"text"` and `"date"` types

**Mobile collapsible panel (lines 194-207):**

- Apply the same fix to the mobile rendering path

### Step 2: Import the `Select` component

Add `import { Select } from "./Field";` to the imports in `FilterBar.tsx`.

### Step 3: Verify the fix

After the fix:

1. Run `cd app && npm run build` to ensure no TypeScript errors
2. Verify the affected routes in a browser:
   - `/attendance` → Course and Period selectors should be dropdowns
   - `/finance` → Tab switcher, Class filter, Category filter, Donor filter should be dropdowns
   - `/people/students` → Class filter should be a dropdown

## Files to Modify

- `app/src/components/ui/FilterBar.tsx` — Add select rendering logic

## Verification Checklist

- [ ] `cd app && npm run build` passes
- [ ] AttendanceBoard course/period selectors render as dropdowns
- [ ] FinanceView tab switcher renders as dropdown
- [ ] FinanceView class/category/donor filters render as dropdowns
- [ ] PeopleView student class filter renders as dropdown
- [ ] Mobile view also shows dropdowns (not text inputs)
- [ ] No TypeScript errors
- [ ] No console warnings about missing options
