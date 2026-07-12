from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ------------------------------------------------------------------ Scope
# Shared visibility/audience shape used by Resource, Form, Announcement —
# resolved by app/modules/operations/audience.py (IMPLEMENT.md §6).
# {"all": true} / {"roles": ["teacher"]} / any-of {classes, sections,
# courses, users}.

class Scope(BaseModel):
    all: bool = False
    roles: list[str] = []
    classes: list[UUID] = []
    sections: list[UUID] = []
    courses: list[UUID] = []
    users: list[UUID] = []


# -------------------------------------------------------------- Timetable

class TimetableSlotCreate(BaseModel):
    class_id: UUID
    section_id: UUID
    course_id: UUID
    teacher_id: UUID
    day_of_week: int = Field(ge=0, le=6, description="0=Monday .. 6=Sunday")
    # Omitted = auto-derived from the slot's start-time position within the
    # section's day (IMPLEMENT.md §4).
    period: int | None = Field(default=None, ge=1)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class TimetableSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    session_id: UUID | None = None
    class_id: UUID
    section_id: UUID
    course_id: UUID
    teacher_id: UUID
    day_of_week: int
    period: int
    start_time: str
    end_time: str
    # Display names so the UI never has to render raw ids.
    class_name: str | None = None
    section_name: str | None = None
    course_name: str | None = None
    teacher_name: str | None = None


class TimetableImportRow(BaseModel):
    class_name: str
    section_name: str
    course_name: str
    teacher_code: str
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class TimetableImportRequest(BaseModel):
    rows: list[TimetableImportRow]
    # Dry-run resolves and validates everything and reports per-row errors
    # without writing (B3-b).
    dry_run: bool = True


class TimetableImportRowResult(BaseModel):
    row: int
    ok: bool
    error: str | None = None


class TimetableImportResponse(BaseModel):
    dry_run: bool
    created: int
    results: list[TimetableImportRowResult]


class HolidayCreate(BaseModel):
    name: str
    category: str | None = None
    start_date: date
    end_date: date
    # Empty/None = madrasa-wide; else only these classes (B4-c).
    class_ids: list[UUID] | None = None


class HolidayUpdate(BaseModel):
    name: str
    category: str | None = None
    start_date: date
    end_date: date
    class_ids: list[UUID] | None = None


class HolidayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    category: str | None = None
    start_date: date
    end_date: date
    class_ids: list | None = None


class LeaveCreate(BaseModel):
    user_id: UUID | None = None
    start_date: date
    end_date: date
    reason: str | None = None


class LeaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    person_name: str | None = None
    person_type: str | None = None
    start_date: date
    end_date: date
    reason: str | None
    status: str


# --------------------------------------------------------------- Resources

class ResourceCategoryCreate(BaseModel):
    name: str


class ResourceCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str


class ResourceCreate(BaseModel):
    category_id: UUID
    title: str
    description: str | None = None
    file_key: str | None = None
    video_url: str | None = None
    visibility_scope: Scope = Scope(all=True)


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    category_id: UUID
    title: str
    description: str | None
    file_key: str | None
    video_url: str | None
    visibility_scope: dict
    created_at: datetime


# ------------------------------------------------------------------ Forms

class FormFieldDefinition(BaseModel):
    key: str
    label: str
    type: str = Field(description="label|text|textarea|radio|checkbox_group|dropdown")
    required: bool = False
    options: list[str] = []


class FormCreate(BaseModel):
    title: str
    description: str = ""
    fields: list[FormFieldDefinition]
    visibility_scope: Scope = Scope(all=True)
    open_from: datetime | None = None
    open_until: datetime | None = None
    allow_multiple: bool = False


class FormRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: str
    fields_definition: list
    visibility_scope: dict
    open_from: datetime | None
    open_until: datetime | None
    allow_multiple: bool
    created_at: datetime


class FormResponseCreate(BaseModel):
    response_data: dict


class FormResponseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    form_id: UUID
    student_id: UUID
    submitted_by_id: UUID
    response_data: dict
    created_at: datetime


# ------------------------------------------------------------ Announcements

class AnnouncementCreate(BaseModel):
    title: str
    body: str
    attachment_link: str | None = None
    audience_scope: Scope = Scope(all=True)
    publish_at: datetime | None = None
    expires_at: datetime | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    attachment_link: str | None = None
    audience_scope: Scope | None = None
    publish_at: datetime | None = None
    expires_at: datetime | None = None


class AnnouncementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    body: str
    attachment_link: str | None
    audience_scope: dict
    publish_at: datetime | None
    expires_at: datetime | None
    created_at: datetime


# ------------------------------------------------------------------- Blog

class BlogPostCreate(BaseModel):
    title: str
    body: str
    published: bool = False
    publish_at: datetime | None = None


class BlogPostUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    published: bool | None = None
    publish_at: datetime | None = None


class BlogPostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    body: str
    published: bool
    publish_at: datetime | None
    author_id: UUID
    created_at: datetime


# -------------------------------------------------------------- Admissions

class AdmissionFormCreate(BaseModel):
    program_id: UUID
    title: str
    description: str = ""
    fields: list[FormFieldDefinition] = []


class AdmissionFormUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    fields: list[FormFieldDefinition] | None = None
    is_open: bool | None = None


class AdmissionFormRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    program_id: UUID
    title: str
    description: str
    fields_definition: list
    public_token: str
    is_open: bool
    created_at: datetime
    program_name: str | None = None


class AdmissionApplicationCreate(BaseModel):
    applicant_name: str
    guardian_contact: str
    program_id: UUID | None = None
    date_of_birth: date | None = None
    notes: str | None = None


class AdmissionApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    applicant_name: str
    guardian_contact: str
    program_id: UUID | None
    date_of_birth: date | None
    notes: str | None
    status: str
    form_id: UUID | None = None
    extra_data: dict | None = None
    created_at: datetime


class ContactEnquiryCreate(BaseModel):
    name: str
    contact: str
    message: str


class ContactEnquiryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    contact: str
    message: str
    status: str
    created_at: datetime


# ---------------------------------------------------------------- Settings

class SettingUpsert(BaseModel):
    key: str
    value: str


class TypedSettingRead(BaseModel):
    key: str
    category: str
    type: str
    label: str
    value: str


class SettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    key: str
    value: str
    updated_at: datetime
