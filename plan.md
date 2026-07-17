# Plan
1. Fix `user_has_permission` in `backend/app/core/dependencies.py` to implicitly return True for teachers when the requested permission is `scoped=True`. This resolves the `Depends(require_permission(...))` 403 blocks for derived access endpoints.
2. Fix `get_me` in `backend/app/modules/auth/routes.py` to include all `scoped=True` permission codes in the `permissions` array returned to the frontend. This ensures the frontend correctly displays the UI elements (like the Attendance and Assessments tabs) for teachers based on their derived capabilities.

I will formulate an implementation plan and request feedback.
