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


class ProgramUpdate(BaseModel):
    name: str | None = None


class AcademicClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    program_id: UUID
    name: str
    default_portal_enabled: bool


class AcademicClassUpdate(BaseModel):
    program_id: UUID | None = None
    name: str | None = None
    default_portal_enabled: bool | None = None


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    name: str


class SectionUpdate(BaseModel):
    name: str | None = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str

class CourseUpdate(BaseModel):
    name: str | None = None

class ClassCourseAssignRequest(BaseModel):
    course_id: UUID


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


class AcademicSessionUpdate(BaseModel):
    name: str | None = None
    gregorian_start: date | None = None
    gregorian_end: date | None = None
    hijri_span: str | None = None
    is_active: bool | None = None


class AcademicClassCreate(BaseModel):
    program_id: UUID
    name: str
    default_portal_enabled: bool = True


class SectionCreate(BaseModel):
    name: str


class CourseCreate(BaseModel):
    name: str


class RolloverMapping(BaseModel):
    current_class_id: UUID
    next_class_id: UUID | None  # None indicates students should graduate (not be enrolled)


class SessionRolloverRequest(BaseModel):
    name: str
    gregorian_start: date
    gregorian_end: date
    hijri_span: str
    class_mappings: list[RolloverMapping]
    # Per-module copy-or-start-fresh choices (B7-h). Everything defaults to
    # "start fresh"; tick what should carry over into the new session.
    copy_timetable: bool = False
    copy_holidays: bool = False
    # Shift copied holiday dates forward by the gap between the two sessions'
    # start dates (e.g. a year), keeping them roughly in place on the calendar.
    shift_holiday_dates: bool = True
