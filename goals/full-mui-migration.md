# Full MUI Migration Fix

**Goal ID:** full-mui-migration-001
**Created:** 2026-07-30

## Overview

Remove ALL CSS classes, inline styles, and hardcoded colors from the Suffa-MS frontend. Migrate everything to MUI's `styled()` API and `sx` prop for full dark mode support, RTL support, and consistency.

## Implementation Plan

See `plans/full-mui-migration-fix.md` for the complete 6-phase plan.

## Auto-Continue Directive

**Mode:** Automatic (no user confirmation between phases)

The system MUST automatically proceed through each phase of the implementation plan above without stopping to ask for user confirmation. When one phase completes, the system MUST immediately begin the next phase, picking up where the previous phase left off.

### Chat Session Continuation

The system MUST automatically continue the chat session between phases. Each phase transition MUST be seamless — the system carries forward all context, decisions, and artifacts from the previous phase without requiring the user to re-orient or re-approve continuation.

### Stopping Conditions

The system MUST only halt execution when one of the following conditions are met:

1. **Goal Fully Implemented** — all phases in the implementation plan are complete and the goal's acceptance criteria are satisfied.
2. **Blocker Requiring Human Intervention** — the system encounters an issue it cannot resolve autonomously (e.g., ambiguous requirements, missing credentials, conflicting constraints, or an external dependency failure). In this case, the system MUST clearly describe the blocker, what was attempted, and what human input is needed.

The system MUST NOT stop for any other reason, including:

- Phase completion (automatically proceed to the next phase)
- Minor uncertainties (make a reasonable decision and document it)
- Routine decisions within the scope of the plan

## Dependencies

- MUI v9.2.0 (already installed)
- React 19 (already installed)
- Vite 6 (already installed)
- TypeScript 5.7 (already installed)

## References

- Implementation plan: `plans/full-mui-migration-fix.md`
- Current theme: `app/src/theme.ts`
- Current styles: `app/src/styles.css`
- Current entry: `app/src/main.tsx`
