from datetime import date, datetime, time
from enum import StrEnum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceStatus(StrEnum):
    present = "present"
    absent = "absent"
    leave = "leave"


class AttendanceEntry(BaseModel):
    subject_type: str = Field(pattern="^(student|teacher)$")
    subject_id: UUID
    session_id: UUID
    attendance_date: date
    status: AttendanceStatus
    captured_at: datetime
    idempotency_key: str
    check_in: Optional[time] = None
    check_out: Optional[time] = None


class AttendanceSyncRequest(BaseModel):
    entries: list[AttendanceEntry]


class AttendanceSyncResponse(BaseModel):
    accepted: int
    synced_late: int
    corrected: int = 0
    idempotency_keys: list[str]
    locked: list[str] = Field(default_factory=list)


class AttendanceOverrideRequest(BaseModel):
    entry: AttendanceEntry
    reason: str = Field(min_length=1)


class AttendanceOverrideResponse(BaseModel):
    idempotency_key: str
    subject_id: UUID


class AttendanceClassRead(BaseModel):
    id: UUID
    name: str
    course_names: list[str] = Field(default_factory=list)
    student_count: int = 0


class AttendanceRosterStudent(BaseModel):
    id: UUID
    admission_number: str
    name: str
    section_id: UUID | None = None
    section_name: str | None = None


class AttendanceRosterResponse(BaseModel):
    session_id: UUID
    session_name: str
    class_id: UUID
    class_name: str
    students: list[AttendanceRosterStudent]


class AttendanceDayBreakdown(BaseModel):
    attendance_date: date
    status: Optional[AttendanceStatus] = None
    excluded_reason: Optional[str] = None  # "holiday" | "leave"


class AttendanceSummary(BaseModel):
    subject_id: UUID
    subject_type: str
    present: int
    absent: int
    leave: int
    excluded_days: int
    days: list[AttendanceDayBreakdown]
