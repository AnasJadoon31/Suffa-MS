from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.phone import PakistanPhone


class TeacherCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    name: str
    whatsapp_number: PakistanPhone = ""
    phone_list: list[PakistanPhone] = Field(default_factory=list)
    default_phone_number: PakistanPhone | None = None
    qualifications: str | None = None
    join_date: date | None = None
    employee_code: str | None = None
    preferred_language: str = "en"
    cnic: str | None = None
    address: str | None = None
    emergency_contact: str | None = None
    photo_file_id: UUID | None = None
    is_principal_delegate: bool | None = None


class TeacherUpdate(BaseModel):
    name: str | None = None
    whatsapp_number: PakistanPhone | None = None
    phone_list: list[PakistanPhone] | None = None
    default_phone_number: PakistanPhone | None = None
    qualifications: str | None = None
    join_date: date | None = None
    notes: str | None = None
    cnic: str | None = None
    address: str | None = None
    emergency_contact: str | None = None
    photo_file_id: UUID | None = None
    is_principal_delegate: bool | None = None


class TeacherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    employee_code: str
    name: str
    whatsapp_number: str
    phone_list: list[str] = Field(default_factory=list)
    default_phone_number: str | None = None
    qualifications: str | None
    join_date: date | None
    status: str
    notes: str | None
    cnic: str | None = None
    address: str | None = None
    emergency_contact: str | None = None
    photo_file_id: UUID | None = None
    is_principal_delegate: bool
    created_at: datetime


class TeacherProvisionedRead(TeacherRead):
    set_password_url: str


class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str | None = Field(default=None, min_length=3, max_length=80)
    name: str | None = None
    date_of_birth: date | None = None
    portal_enabled: bool | None = None
    guardian_ids: list[UUID] = Field(default_factory=list)
    preferred_language: str = "ur"
    b_form_number: str | None = None
    address: str | None = None
    phone: PakistanPhone | None = None
    phone_list: list[PakistanPhone] = Field(default_factory=list)
    default_phone_number: PakistanPhone | None = None
    is_independent: bool = False
    photo_file_id: UUID | None = None
    admission_form_id: UUID | None = None
    admission_answers: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_independent_student(self) -> "StudentCreate":
        if self.is_independent and self.guardian_ids:
            raise ValueError("an independent student cannot have guardian links")
        return self


class StudentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    date_of_birth: date | None = None
    portal_enabled: bool | None = None
    notes: str | None = None
    b_form_number: str | None = None
    address: str | None = None
    phone: PakistanPhone | None = None
    phone_list: list[PakistanPhone] | None = None
    default_phone_number: PakistanPhone | None = None
    is_independent: bool | None = None
    photo_file_id: UUID | None = None
    admission_answers: dict | None = None


class StudentAdmissionRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    form_id: UUID | None = None
    application_id: UUID | None = None
    form_title: str | None = None
    fields_definition: list
    answers: dict
    created_at: datetime


class StudentEnrollmentRead(BaseModel):
    id: UUID
    session_id: UUID
    session_name: str
    program_id: UUID
    program_name: str
    class_id: UUID
    class_name: str
    section_id: UUID
    section_name: str
    started_on: date


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
    username: str | None = None
    current_class: str | None = None
    b_form_number: str | None = None
    address: str | None = None
    phone: str | None = None
    phone_list: list[str] = Field(default_factory=list)
    default_phone_number: str | None = None
    is_independent: bool = False
    photo_file_id: UUID | None = None
    admission_record: StudentAdmissionRecordRead | None = None
    active_enrollment: StudentEnrollmentRead | None = None
    created_at: datetime


class StudentProvisionedRead(StudentRead):
    set_password_url: str


class GuardianCreate(BaseModel):
    name: str
    relationship: str
    phone_numbers: PakistanPhone
    phone_list: list[PakistanPhone] = Field(default_factory=list)
    default_phone_number: PakistanPhone | None = None
    cnic: str | None = None
    address: str | None = None
    student_ids: list[UUID] = Field(default_factory=list)

class GuardianUpdate(BaseModel):
    name: str | None = None
    relationship: str | None = None
    phone_numbers: PakistanPhone | None = None
    phone_list: list[PakistanPhone] | None = None
    default_phone_number: PakistanPhone | None = None
    cnic: str | None = None
    address: str | None = None


class GuardianRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID | None = None
    username: str | None = None
    name: str
    status: str
    relationship: str
    phone_numbers: str
    phone_list: list[str] = Field(default_factory=list)
    default_phone_number: str | None = None
    cnic: str | None = None
    address: str | None = None
    is_donor: bool = False
    created_at: datetime


class GuardianCredentialsRequest(BaseModel):
    # Required on first provisioning; ignored when the guardian already has a
    # login (the link is simply re-issued).
    username: str | None = None


class MyProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    date_of_birth: date | None = None
    b_form_number: str | None = None
    address: str | None = None
    phone_list: list[PakistanPhone] | None = None
    default_phone_number: PakistanPhone | None = None
    cnic: str | None = None
    relationship: str | None = None
    admission_answers: dict | None = None
