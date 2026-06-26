from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceStatus(StrEnum):
    present = "present"
    absent = "absent"
    leave = "leave"


class AttendanceEntry(BaseModel):
    subject_type: str = Field(pattern="^(student|teacher)$")
    subject_id: UUID | str
    attendance_date: date
    status: AttendanceStatus
    captured_at: datetime
    idempotency_key: str


class AttendanceSyncRequest(BaseModel):
    entries: list[AttendanceEntry]


class AttendanceSyncResponse(BaseModel):
    accepted: int
    synced_late: int
    idempotency_keys: list[str]
