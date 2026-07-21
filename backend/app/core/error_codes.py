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
    WHATSAPP_DELIVERY_NOT_CONFIGURED = "whatsapp_delivery_not_configured"
    WHATSAPP_MEDIA_DELIVERY_FAILED = "whatsapp_media_delivery_failed"
    COURSE_NAME_EXISTS = "course_name_exists"
    PERMISSION_REQUIRED = "permission_required"
    GRADING_SCHEME_NOT_FOUND = "grading_scheme_not_found"
    GRADING_SCHEME_IN_USE = "grading_scheme_in_use"
    EXAM_TYPE_NOT_FOUND = "exam_type_not_found"
    EXAM_TYPE_HAS_MARKS = "exam_type_has_marks"
    ATTENDANCE_SECTION_NOT_ASSIGNED = "attendance_section_not_assigned"
    ATTENDANCE_SECTION_REQUIRED = "attendance_section_required"
    ATTENDANCE_SLOT_NOT_ASSIGNED = "attendance_slot_not_assigned"
    SECTION_NOT_FOUND = "section_not_found"
    REPORT_SECTION_REQUIRED = "report_section_required"
    REPORT_SECTION_NOT_ASSIGNED = "report_section_not_assigned"
    ADMISSION_NUMBER_EXISTS = "admission_number_exists"
