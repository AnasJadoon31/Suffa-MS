from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProgramCreate(BaseModel):
    name: str
    default_portal_enabled: bool = True

class ProgramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    default_portal_enabled: bool = True
    created_at: datetime


class ProgramUpdate(BaseModel):
    name: str | None = None
    default_portal_enabled: bool | None = None


class AcademicClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    program_id: UUID
    name: str
    default_portal_enabled: bool
    assignment_limit: int | None = Field(default=None, ge=1)
    section_count: int = 0


class AcademicClassUpdate(BaseModel):
    program_id: UUID | None = None
    name: str | None = None
    default_portal_enabled: bool | None = None
    assignment_limit: int | None = Field(default=None, ge=1)


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    name: str
    student_count: int = 0


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
    effective_date: date | None = None


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    student_id: UUID
    session_id: UUID
    program_id: UUID
    class_id: UUID
    section_id: UUID
    started_on: date
    ended_on: date | None
    is_active: bool


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
    assignment_limit: int | None = Field(default=None, ge=1)


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


# ------------------------------------------------------------------ Daily Reports

DailyReportFieldType = Literal[
    "label", "text", "textarea", "radio", "checkbox_group",
    "dropdown", "phone", "file", "image", "boolean",
]
DAILY_REPORT_OPTION_TYPES = {"radio", "checkbox_group", "dropdown"}


class DailyReportFieldDefinition(BaseModel):
    key: str | None = None
    label: str
    type: DailyReportFieldType
    required: bool = False
    options: list[str] = Field(default_factory=list)
    enabled: bool = True

    @model_validator(mode="after")
    def normalize(self) -> "DailyReportFieldDefinition":
        if not self.key:
            self.key = self.label.lower().strip().replace(" ", "_")[:64]
        if self.type in DAILY_REPORT_OPTION_TYPES and len(self.options) < 1:
            raise ValueError(f"Field '{self.label}' of type '{self.type}' requires at least one option.")
        return self


class DailyReportConfigCreate(BaseModel):
    class_id: UUID
    enabled: bool = False
    fields_definition: list[DailyReportFieldDefinition] = Field(default_factory=list)


class DailyReportConfigUpdate(BaseModel):
    enabled: bool | None = None
    fields_definition: list[DailyReportFieldDefinition] | None = None


class DailyReportConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    enabled: bool
    fields_definition: list[dict]
    created_at: datetime
    updated_at: datetime


class DailyReportEntryValues(BaseModel):
    values: dict[str, Any]


class DailyReportEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    section_id: UUID
    student_id: UUID
    date: date
    values: dict
    created_by_id: UUID
    updated_by_id: UUID | None
    created_at: datetime
    updated_at: datetime
