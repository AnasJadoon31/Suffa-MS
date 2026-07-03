from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProgramCreate(BaseModel):
    name: str

class ProgramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    created_at: datetime


class AcademicClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    program_id: UUID
    name: str
    default_portal_enabled: bool


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    name: str


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    name: str


class StudentProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    first_name: str
    last_name: str
    gender: str
    date_of_birth: date | None = None
    enrollment_date: date


class StudentEnrollRequest(BaseModel):
    student_id: UUID
    session_id: UUID
    program_id: UUID
    class_id: UUID
    section_id: UUID


class TeacherProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    first_name: str
    last_name: str
    joining_date: date


class AcademicSessionCreate(BaseModel):
    name: str
    gregorian_start: date
    gregorian_end: date
    hijri_span: str
    is_active: bool = False

class AcademicSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    gregorian_start: date
    gregorian_end: date
    hijri_span: str
    is_active: bool
