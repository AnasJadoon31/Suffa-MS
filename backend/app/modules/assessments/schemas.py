from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    class_id: UUID
    course_id: UUID
    title: str
    instructions: str
    attachment_key: str | None = None
    due_date: datetime
    target_student_ids: list[UUID] = []


class AssignmentUpdate(BaseModel):
    title: str | None = None
    instructions: str | None = None
    attachment_key: str | None = None
    due_date: datetime | None = None
    target_student_ids: list[UUID] | None = None


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    course_id: UUID
    title: str
    instructions: str
    attachment_key: str | None
    due_date: datetime
    target_student_ids: list | None
    created_by_id: UUID | None
    created_at: datetime


class SubmissionCreate(BaseModel):
    file_key: str


class SubmissionGrade(BaseModel):
    mark: float | None = None
    feedback: str | None = None


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    assignment_id: UUID
    student_id: UUID
    submitted_at: datetime
    file_key: str
    mark: float | None
    feedback: str | None
    is_late: bool = False


class GradeBand(BaseModel):
    label: str
    min_score: float
    max_score: float


class GradingSchemeCreate(BaseModel):
    name: str
    bands: list[GradeBand]


class GradingSchemeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    bands: list


class ExamTypeCreate(BaseModel):
    course_id: UUID
    name: str
    weightage: float = Field(gt=0)
    grading_scheme_id: UUID


class ExamTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    course_id: UUID
    name: str
    weightage: float
    grading_scheme_id: UUID


class MarkUpsert(BaseModel):
    exam_type_id: UUID
    student_id: UUID
    score: float = Field(ge=0)


class MarkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    exam_type_id: UUID
    student_id: UUID
    score: float
    entered_by_id: UUID | None


class CourseResult(BaseModel):
    course_id: UUID
    raw_score: float | None
    band: str | None
    exam_count: int


class SessionResult(BaseModel):
    session_id: UUID
    student_id: UUID
    course_results: list[CourseResult]
    overall_score: float | None
    published: bool


class PublishRequest(BaseModel):
    session_id: UUID
    student_ids: list[UUID]
