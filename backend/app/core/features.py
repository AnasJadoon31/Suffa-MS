"""Per-madrasa feature flags (IMPLEMENT.md §1).

Feature flags are set exclusively by super admins on platform endpoints and
mirror the portal's modules. A missing row means "enabled" — onboarding is
subtractive: super admin switches off what a madrasa didn't sign up for.
Deliberately separate from MadrasaSetting so principals cannot override them.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    key: str
    label: str


FEATURES: tuple[Feature, ...] = (
    Feature("attendance", "Attendance"),
    Feature("timetable", "Timetable"),
    Feature("holidays", "Holidays"),
    Feature("leave", "Leave"),
    Feature("announcements", "Announcements"),
    Feature("assessments", "Assessments"),
    Feature("resources", "Resources"),
    Feature("forms", "Forms"),
    Feature("admissions", "Admissions"),
    Feature("finance", "Finance"),
    Feature("salary", "Salary"),
    Feature("reports", "Reports"),
    Feature("blog", "Blog"),
    Feature("messaging", "Messaging"),
)

FEATURE_KEYS: frozenset[str] = frozenset(feature.key for feature in FEATURES)


def require_known_feature(key: str) -> str:
    if key not in FEATURE_KEYS:
        raise KeyError(f"Unknown feature: {key}")
    return key
