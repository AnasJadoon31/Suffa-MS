from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TeacherCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    name: str
    whatsapp_number: str = ""
    qualifications: str | None = None
    join_date: date | None = None
    employee_code: str | None = None
    preferred_language: str = "en"


class TeacherUpdate(BaseModel):
    name: str | None = None
    whatsapp_number: str | None = None
    qualifications: str | None = None
    join_date: date | None = None
    notes: str | None = None


class TeacherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    employee_code: str
    name: str
    whatsapp_number: str
    qualifications: str | None
    join_date: date | None
    status: str
    notes: str | None
    created_at: datetime


class TeacherProvisionedRead(TeacherRead):
    set_password_url: str


class StudentCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    name: str
    date_of_birth: date
    admission_number: str | None = None
    portal_enabled: bool | None = None
    guardian_ids: list[UUID] = []
    preferred_language: str = "ur"


class StudentUpdate(BaseModel):
    name: str | None = None
    date_of_birth: date | None = None
    portal_enabled: bool | None = None
    notes: str | None = None


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    admission_number: str
    name: str
    date_of_birth: date
    status: str
    portal_enabled: bool
    notes: str | None
    created_at: datetime


class StudentProvisionedRead(StudentRead):
    set_password_url: str


class GuardianCreate(BaseModel):
    name: str
    relationship: str
    phone_numbers: str
    preferred_language: str = "ur"
    student_ids: list[UUID] = []


class GuardianRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    relationship: str
    phone_numbers: str
    preferred_language: str
    created_at: datetime
