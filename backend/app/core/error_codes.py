from enum import StrEnum


class ErrorCode(StrEnum):
    """Stable machine-readable API errors; clients own localized copy."""

    SESSION_VIEW_ONLY = "session_view_only"
