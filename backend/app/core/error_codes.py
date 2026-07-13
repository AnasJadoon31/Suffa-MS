from enum import StrEnum


class ErrorCode(StrEnum):
    """Stable machine-readable API errors; clients own localized copy."""

    SESSION_VIEW_ONLY = "session_view_only"
    STUDENT_SELF_ATTENDANCE_ONLY = "student_self_attendance_only"
    STUDENT_NOT_ENROLLED = "student_not_enrolled"
    CLASS_NOT_FOUND = "class_not_found"
    TIMETABLE_SELF_SERVICE_ONLY = "timetable_self_service_only"
    ASSIGNMENT_NOT_ASSIGNED = "assignment_not_assigned"
    TEACHER_SELF_ATTENDANCE_ONLY = "teachers_self_attendance_only"
