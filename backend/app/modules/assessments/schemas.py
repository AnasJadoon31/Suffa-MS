from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssignmentCreate(BaseModel):
    class_id: UUID
    course_id: UUID
    # Empty = whole class; one or more ids = one assignment row per section
    # (multi-section publish shares a batch_id, IMPLEMENT.md §5).
    section_ids: list[UUID] = []
    title: str
    category: str | None = Field(default=None, max_length=60)
    instructions: str
    attachment_key: str | None = None
    due_date: datetime
    target_student_ids: list[UUID] = []


class AssignmentUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    instructions: str | None = None
    attachment_key: str | None = None
    due_date: datetime | None = None
    target_student_ids: list[UUID] | None = None
    # Apply the edit to every row sharing this assignment's batch_id.
    apply_to_batch: bool = False


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    class_id: UUID
    section_id: UUID | None = None
    course_id: UUID
    title: str
    category: str | None = None
    instructions: str
    attachment_key: str | None
    due_date: datetime
    target_student_ids: list | None
    created_by_id: UUID | None
    batch_id: UUID | None = None
    created_at: datetime
    # Display names (never show raw ids in the UI).
    class_name: str | None = None
    section_name: str | None = None
    course_name: str | None = None
    teacher_name: str | None = None


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


# ------------------------------------------------- Results matrix (§5)

class MatrixExamType(BaseModel):
    id: UUID
    name: str
    weightage: float


class MatrixCourse(BaseModel):
    course_id: UUID
    course_name: str
    teacher_name: str | None = None
    exam_types: list[MatrixExamType] = []


class MatrixMark(BaseModel):
    exam_type_id: UUID
    score: float | None = None


class MatrixCourseCell(BaseModel):
    course_id: UUID
    raw_score: float | None = None
    band: str | None = None
    marks: list[MatrixMark] = []


class MatrixStudentRow(BaseModel):
    student_id: UUID
    name: str
    admission_number: str
    courses: list[MatrixCourseCell] = []
    overall_score: float | None = None


class SectionResultMatrix(BaseModel):
    class_id: UUID
    class_name: str
    section_id: UUID
    section_name: str
    courses: list[MatrixCourse] = []
    students: list[MatrixStudentRow] = []


class ResultsMatrixResponse(BaseModel):
    session_id: UUID
    sections: list[SectionResultMatrix] = []


class PublishRequest(BaseModel):
    session_id: UUID
    student_ids: list[UUID]
