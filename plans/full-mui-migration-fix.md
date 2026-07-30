# Full MUI Migration Fix Plan

> **Goal**: Remove ALL CSS classes, inline styles, and hardcoded colors. Migrate everything to MUI's `styled()` API and `sx` prop for full dark mode support and consistency.

---

## Current State Analysis

### CSS Classes Referenced (88 total)

| Class                       | Files Using It          | Status    |
| --------------------------- | ----------------------- | --------- |
| `primaryAction`             | 15+ files               | ❌ No CSS |
| `secondaryAction`           | 15+ files               | ❌ No CSS |
| `dangerAction`              | 3 files                 | ❌ No CSS |
| `loading-screen`            | App.tsx                 | ❌ No CSS |
| `skipLink`                  | App.tsx                 | ❌ No CSS |
| `formStack`                 | Modal.tsx               | ❌ No CSS |
| `inlineForm`                | Modal.tsx               | ❌ No CSS |
| `formGridTwo`               | FormsView.tsx           | ❌ No CSS |
| `modalCard`                 | Modal.tsx               | ❌ No CSS |
| `modalHeader`               | Modal.tsx               | ❌ No CSS |
| `modalBody`                 | Modal.tsx               | ❌ No CSS |
| `input-with-icon`           | LoginScreen.tsx         | ❌ No CSS |
| `login-container`           | LoginScreen.tsx         | ❌ No CSS |
| `login-hero`                | LoginScreen.tsx         | ❌ No CSS |
| `login-card`                | LoginScreen.tsx         | ❌ No CSS |
| `login-form`                | LoginScreen.tsx         | ❌ No CSS |
| `login-header`              | LoginScreen.tsx         | ❌ No CSS |
| `login-icon-wrapper`        | LoginScreen.tsx         | ❌ No CSS |
| `login-button`              | LoginScreen.tsx         | ❌ No CSS |
| `login-error`               | LoginScreen.tsx         | ❌ No CSS |
| `form-group`                | LoginScreen.tsx         | ❌ No CSS |
| `input-icon`                | LoginScreen.tsx         | ❌ No CSS |
| `login-split`               | LoginScreen.tsx         | ❌ No CSS |
| `hero-content`              | LoginScreen.tsx         | ❌ No CSS |
| `hero-stats`                | LoginScreen.tsx         | ❌ No CSS |
| `stat-card`                 | LoginScreen.tsx         | ❌ No CSS |
| `glass`                     | LoginScreen.tsx         | ❌ No CSS |
| `slide-in`                  | LoginScreen.tsx         | ❌ No CSS |
| `iconButton`                | App.tsx, Sidebar.tsx    | ❌ No CSS |
| `navToggle`                 | App.tsx                 | ❌ No CSS |
| `topbar`                    | App.tsx                 | ❌ No CSS |
| `topbarContext`             | App.tsx                 | ❌ No CSS |
| `topbar-actions`            | App.tsx                 | ❌ No CSS |
| `viewDescription`           | App.tsx                 | ❌ No CSS |
| `dateChip`                  | App.tsx                 | ❌ No CSS |
| `dateChipText`              | App.tsx                 | ❌ No CSS |
| `profileChip`               | App.tsx                 | ❌ No CSS |
| `profileChipText`           | App.tsx                 | ❌ No CSS |
| `profileChipButton`         | App.tsx                 | ❌ No CSS |
| `avatar`                    | Sidebar.tsx             | ❌ No CSS |
| `avatarSmall`               | Sidebar.tsx             | ❌ No CSS |
| `roleBadge`                 | Sidebar.tsx             | ❌ No CSS |
| `role-principal`            | Sidebar.tsx             | ❌ No CSS |
| `role-teacher`              | Sidebar.tsx             | ❌ No CSS |
| `role-student`              | Sidebar.tsx             | ❌ No CSS |
| `pwaStatusChip`             | PwaStatus.tsx           | ❌ No CSS |
| `pwaStatusChip-offline`     | PwaStatus.tsx           | ❌ No CSS |
| `pwaStatusChip-update`      | PwaStatus.tsx           | ❌ No CSS |
| `sessionReadOnlyBanner`     | SessionSwitcher.tsx     | ❌ No CSS |
| `sessionSwitcherSelect`     | SessionSwitcher.tsx     | ❌ No CSS |
| `modulePanel`               | Layout.tsx              | ❌ No CSS |
| `moduleHeader`              | Layout.tsx              | ❌ No CSS |
| `notice`                    | Various                 | ❌ No CSS |
| `notice-warning`            | Various                 | ❌ No CSS |
| `emptyState`                | Various                 | ❌ No CSS |
| `compactEmptyState`         | Various                 | ❌ No CSS |
| `filterBar`                 | FilterBar.tsx           | ❌ No CSS |
| `card`                      | Card.tsx                | ❌ No CSS |
| `blogCard`                  | Card.tsx                | ❌ No CSS |
| `blogGrid`                  | BlogView.tsx            | ❌ No CSS |
| `metricGrid`                | Card.tsx                | ❌ No CSS |
| `metricCard`                | Card.tsx                | ❌ No CSS |
| `metricValue`               | Card.tsx                | ❌ No CSS |
| `metricTrend`               | Card.tsx                | ❌ No CSS |
| `dataTable`                 | DataTable.tsx           | ❌ No CSS |
| `dataRow`                   | DataTable.tsx           | ❌ No CSS |
| `formActions`               | Various                 | ❌ No CSS |
| `sectionPicker`             | Various                 | ❌ No CSS |
| `gradingPlanCard`           | AssessmentsView.tsx     | ❌ No CSS |
| `gradingPlanHeader`         | AssessmentsView.tsx     | ❌ No CSS |
| `weightTotal`               | AssessmentsView.tsx     | ❌ No CSS |
| `weightTotal.valid`         | AssessmentsView.tsx     | ❌ No CSS |
| `weightTotal.invalid`       | AssessmentsView.tsx     | ❌ No CSS |
| `assessmentTable`           | AssessmentsView.tsx     | ❌ No CSS |
| `assessmentMobileList`      | AssessmentsView.tsx     | ❌ No CSS |
| `courseMapList`             | AcademicsView.tsx       | ❌ No CSS |
| `formFieldsList`            | FormsView.tsx           | ❌ No CSS |
| `importExample`             | TimetableView.tsx       | ❌ No CSS |
| `whatsappConnectionActions` | SettingsView.tsx        | ❌ No CSS |
| `whatsappPairingSuccess`    | SettingsView.tsx        | ❌ No CSS |
| `whatsappQrImage`           | SettingsView.tsx        | ❌ No CSS |
| `settingsLabel`             | SettingsView.tsx        | ❌ No CSS |
| `delegateList`              | DelegateButton.tsx      | ❌ No CSS |
| `publicFormCard`            | PublicAdmissionPage.tsx | ❌ No CSS |
| `publicAdmissionForm`       | PublicAdmissionPage.tsx | ❌ No CSS |
| `visuallyHidden`            | Various                 | ❌ No CSS |
| `notFoundView`              | NotFoundView.tsx        | ❌ No CSS |
| `notFoundCode`              | NotFoundView.tsx        | ❌ No CSS |
| `errorText`                 | Various                 | ❌ No CSS |
| `pwaFilterStack`            | Various                 | ❌ No CSS |

### Hardcoded Colors (50+ instances)

- `#0f766e` (teal) - 30+ files
- `#b94a48` (rose) - 15+ files
- `#e0e6df` (line) - 20+ files
- `#5f6d67` (muted) - 15+ files
- `#c77d1a` (saffron) - 10+ files
- `#3f7f4c` (leaf) - 10+ files
- `#0b4f49` (brand-deep) - 5+ files
- `#fdf3e2` (saffron-soft) - 5+ files
- `#fbeeed` (rose-soft) - 5+ files
- `#e9f4ec` (leaf-soft) - 5+ files
- `#16211d` (ink) - 10+ files
- `#9bb8b0` (faint) - 5+ files
- `#efb45f` (gold-light) - 3+ files
- `#8a5511` (saffron-dark) - 3+ files
- `#2c1d05` (brand-ink) - 2+ files
- `#0d2f2b` (brand-ink) - 2+ files

### Inline Styles (100+ instances)

- `DashboardCards.tsx`: ~20 inline styles
- `AttendanceBoard.tsx`: ~15 inline styles
- `PeopleView.tsx`: ~10 inline styles
- `FinanceView.tsx`: ~10 inline styles
- `AcademicsView.tsx`: ~10 inline styles
- `AdmissionsView.tsx`: ~8 inline styles
- `AssessmentsView.tsx`: ~8 inline styles
- `HolidaysView.tsx`: ~5 inline styles
- `LeaveView.tsx`: ~5 inline styles
- `ResourcesView.tsx`: ~5 inline styles
- `FormsView.tsx`: ~5 inline styles
- `SalaryView.tsx`: ~5 inline styles
- `SettingsView.tsx`: ~5 inline styles
- `BlogView.tsx`: ~5 inline styles
- `ReportsView.tsx`: ~5 inline styles
- `PlatformView.tsx`: ~5 inline styles
- `ProfileView.tsx`: ~5 inline styles
- `TimetableView.tsx`: ~5 inline styles
- `MyAssessmentsView.tsx`: ~5 inline styles
- `MyAttendanceView.tsx`: ~5 inline styles
- `MyTimetableView.tsx`: ~5 inline styles
- `PublicAdmissionPage.tsx`: ~5 inline styles
- `SessionSwitcher.tsx`: ~3 inline styles
- `PwaStatus.tsx`: ~3 inline styles
- `DelegateButton.tsx`: ~3 inline styles
- `SearchDropdown.tsx`: ~3 inline styles
- `RichTextEditor.tsx`: ~3 inline styles
- `HijriTag.tsx`: ~2 inline styles
- `DateRangeFilter.tsx`: ~2 inline styles
- `AudiencePicker.tsx`: ~2 inline styles
- `StagedAudiencePicker.tsx`: ~2 inline styles
- `AdmissionAnswersFields.tsx`: ~2 inline styles
- `FormFieldsEditor.tsx`: ~2 inline styles
- `AsyncState.tsx`: ~2 inline styles
- `Snackbar.tsx`: ~2 inline styles
- `PhoneInput.tsx`: ~2 inline styles
- `ActionMenu.tsx`: ~2 inline styles
- `Pagination.tsx`: ~2 inline styles
- `DataTable.tsx`: ~2 inline styles
- `Card.tsx`: ~2 inline styles
- `Layout.tsx`: ~2 inline styles
- `Field.tsx`: ~2 inline styles
- `Button.tsx`: ~1 inline style
- `Modal.tsx`: ~1 inline style
- `FilterBar.tsx`: ~1 inline style
- `DataCard.tsx`: ~1 inline style
- `DataViewToggle.tsx`: ~1 inline style
- `QuickActions.tsx`: ~1 inline style
- `ActivityFeed.tsx`: ~1 inline style
- `BottomTabBar.tsx`: ~1 inline style
- `AppBar.tsx`: ~1 inline style
- `Sidebar.tsx`: ~1 inline style
- `NavDrawer.tsx`: ~1 inline style
- `LoginScreen.tsx`: ~1 inline style
- `SetPasswordPage.tsx`: ~1 inline style
- `NotFoundView.tsx`: ~1 inline style
- `InstallPrompt.tsx`: ~1 inline style
- `PullToRefresh.tsx`: ~1 inline style
- `Skeleton.tsx`: ~1 inline style

---

## Migration Strategy

### Phase 1: Create Shared MUI Styled Components

**File: `app/src/components/ui/Button.tsx`** — Rewrite

- Create `PrimaryButton`, `SecondaryButton`, `DangerButton`, `IconButton` as styled MUI buttons
- Export these as named exports
- Remove the `variantForClass` and `colorForClass` functions

**File: `app/src/components/ui/Card.tsx`** — Rewrite

- Create `StyledCard`, `StyledCardHeader`, `StyledCardBody`, `StyledCardActions`
- Export these as named exports

**File: `app/src/components/ui/Layout.tsx`** — Rewrite

- Create `PageSection`, `PageHeader`, `PageTitle`, `PageNotice` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/Modal.tsx`** — Rewrite

- Create `ModalCard`, `ModalHeader`, `ModalBody`, `ModalActions` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/FormLayout.tsx`** — Rewrite

- Create `FormStack`, `FormSection`, `FormRow`, `FormActions`, `FormField` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/FilterBar.tsx`** — Rewrite

- Create `FilterBarContainer`, `FilterFieldGroup`, `FilterActions` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/DataTable.tsx`** — Rewrite

- Create `StyledTable`, `StyledTableRow`, `StyledTableCell` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/AsyncState.tsx`** — Rewrite

- Create `LoadingContainer`, `ErrorContainer` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/Snackbar.tsx`** — Rewrite

- Create `SnackbarContainer`, `SnackbarToast` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/PhoneInput.tsx`** — Rewrite

- Create `PhoneInputWrapper`, `PhonePrefix`, `PhoneInputField` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/ActionMenu.tsx`** — Rewrite

- Create `ActionMenuTrigger`, `ActionMenuDropdown`, `ActionMenuItem` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/Pagination.tsx`** — Rewrite

- Create `PaginationContainer` as styled MUI component
- Export as named export

**File: `app/src/components/ui/Skeleton.tsx`** — Rewrite

- Create `SkeletonText`, `SkeletonCard`, `SkeletonAvatar`, `SkeletonTable`, `SkeletonForm` as styled MUI components
- Export these as named exports

**File: `app/src/components/ui/EmptyState.tsx`** — Rewrite

- Create `EmptyStateContainer`, `EmptyStateIcon`, `EmptyStateTitle`, `EmptyStateMessage` as styled MUI components
- Export these as named exports

### Phase 2: Fix App.tsx and Layout Components

**File: `app/src/App.tsx`** — Fix

- Replace `className="loading-screen"` with MUI styled component
- Replace `className="skipLink"` with MUI styled component
- Replace `className="iconButton"` with MUI styled component
- Replace `className="navToggle"` with MUI styled component
- Replace `className="topbar"` with MUI styled component
- Replace `className="topbarContext"` with MUI styled component
- Replace `className="topbar-actions"` with MUI styled component
- Replace `className="viewDescription"` with MUI styled component
- Replace `className="dateChip"` with MUI styled component
- Replace `className="dateChipText"` with MUI styled component
- Replace `className="profileChip"` with MUI styled component
- Replace `className="profileChipText"` with MUI styled component
- Replace `className="profileChipButton"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/Sidebar.tsx`** — Fix

- Replace `className="avatar"` with MUI styled component
- Replace `className="avatarSmall"` with MUI styled component
- Replace `className="roleBadge"` with MUI styled component
- Replace `className="role-principal"` with MUI styled component
- Replace `className="role-teacher"` with MUI styled component
- Replace `className="role-student"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/BottomTabBar.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/AppBar.tsx`** — Fix

- Replace `window.location.pathname` with `useLocation()` from react-router
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/NavDrawer.tsx`** — Fix

- Replace hardcoded colors in inline styles with theme-aware values
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/LoginScreen.tsx`** — Fix

- Replace `className="login-container"` with MUI styled component
- Replace `className="login-split"` with MUI styled component
- Replace `className="login-hero"` with MUI styled component
- Replace `className="hero-content"` with MUI styled component
- Replace `className="hero-stats"` with MUI styled component
- Replace `className="stat-card"` with MUI styled component
- Replace `className="login-form-container"` with MUI styled component
- Replace `className="login-card"` with MUI styled component
- Replace `className="glass"` with MUI styled component
- Replace `className="login-header"` with MUI styled component
- Replace `className="login-icon-wrapper"` with MUI styled component
- Replace `className="login-form"` with MUI styled component
- Replace `className="form-group"` with MUI styled component
- Replace `className="input-with-icon"` with MUI styled component
- Replace `className="input-icon"` with MUI styled component
- Replace `className="login-button"` with MUI styled component
- Replace `className="login-error"` with MUI styled component
- Replace `className="slide-in"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/SetPasswordPage.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/NotFoundView.tsx`** — Fix

- Replace `className="notFoundView"` with MUI styled component
- Replace `className="notFoundCode"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/PwaStatus.tsx`** — Fix

- Replace `className="pwaStatusChip"` with MUI styled component
- Replace `className="pwaStatusChip-offline"` with MUI styled component
- Replace `className="pwaStatusChip-update"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/SessionSwitcher.tsx`** — Fix

- Replace `className="sessionReadOnlyBanner"` with MUI styled component
- Replace `className="sessionSwitcherSelect"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/DelegateButton.tsx`** — Fix

- Replace `className="delegateList"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/SearchDropdown.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/RichTextEditor.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/HijriTag.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/DateRangeFilter.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/AudiencePicker.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/StagedAudiencePicker.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/AdmissionAnswersFields.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/FormFieldsEditor.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/InstallPrompt.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/PullToRefresh.tsx`** — Fix

- Replace all inline styles with MUI `sx` prop or styled components

### Phase 3: Fix Dashboard, People, Attendance, Finance Views

**File: `app/src/components/DashboardCards.tsx`** — Fix

- Replace all 20+ inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/PeopleView.tsx`** — Fix

- Replace all 10+ inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/AttendanceBoard.tsx`** — Fix

- Replace all 15+ inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/FinanceView.tsx`** — Fix

- Replace all 10+ inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

### Phase 4: Fix All Remaining Views

**File: `app/src/components/AcademicsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/AdmissionsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/AnnouncementsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/AssessmentsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/HolidaysView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/LeaveView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/ResourcesView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/FormsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/SalaryView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/SettingsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/BlogView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/ReportsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/PlatformView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/ProfileView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/TimetableView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/MyAssessmentsView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/MyAttendanceView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/MyTimetableView.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

**File: `app/src/components/PublicAdmissionPage.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components
- Replace hardcoded colors with theme-aware values

### Phase 5: Fix UI Components

**File: `app/src/components/ui/Modal.tsx`** — Fix

- Replace `className="modalCard"` with MUI styled component
- Replace `className="modalHeader"` with MUI styled component
- Replace `className="modalBody"` with MUI styled component
- Replace `className="formStack"` with MUI styled component
- Replace `className="inlineForm"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/FormLayout.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/FilterBar.tsx`** — Fix

- Replace `className="filterBar"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/DataTable.tsx`** — Fix

- Replace `className="dataTable"` with MUI styled component
- Replace `className="dataRow"` with MUI styled component
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/AsyncState.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/Snackbar.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/PhoneInput.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/ActionMenu.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/Pagination.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/Skeleton.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

**File: `app/src/components/ui/EmptyState.tsx`** — Fix

- Replace all CSS class references with MUI styled components
- Replace all inline styles with MUI `sx` prop or styled components

### Phase 6: Final Cleanup

**File: `app/src/styles.css`** — Delete entirely

- Remove the file completely
- Remove the import from `main.tsx`

**File: `app/src/main.tsx`** — Update

- Remove `import "./styles.css"`

**Verification**

- Run `npm run build` to check for errors
- Run `npm run dev` to verify UI works
- Check dark mode works
- Check RTL/Urdu works
- Check mobile responsiveness

---

## Migration Rules

1. **Never use `className`** for custom styles — only for MUI's built-in classes
2. **Never use inline `style={{}}`** — use MUI `sx` prop or `styled()` API
3. **Never hardcode colors** — use `theme.palette.*` or `theme.palette.*.main`
4. **Always use theme-aware values** for dark mode support
5. **Prefer `sx` prop** for one-off styles
6. **Prefer `styled()` API** for reusable components
7. **Use `Box`** instead of `div` for layout
8. **Use `Typography`** instead of `h1`, `h2`, `p`, `span` for text
9. **Use `Paper`** instead of `div` with border/shadow for cards
10. **Use `Stack`** instead of `div` with flexbox for spacing

---

## Success Criteria

- [ ] `styles.css` file deleted
- [ ] No `className` references to custom CSS classes
- [ ] No inline `style={{}}` blocks
- [ ] No hardcoded hex colors
- [ ] All components use MUI `styled()` API or `sx` prop
- [ ] Dark mode works across all views
- [ ] RTL/Urdu works across all views
- [ ] Mobile responsive works across all views
- [ ] `npm run build` passes
- [ ] All existing functionality preserved
