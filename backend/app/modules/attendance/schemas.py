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
    idempotency_keys: list[str]
    locked: list[str] = Field(default_factory=list)


class AttendanceOverrideRequest(BaseModel):
    entry: AttendanceEntry
    reason: str = Field(min_length=1)


class AttendanceOverrideResponse(BaseModel):
    idempotency_key: str
    subject_id: UUID


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
