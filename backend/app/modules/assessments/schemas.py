from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AssignmentCreate(BaseModel):
    # Required unless all_classes=True, in which case the target class list
    # is resolved server-side (every class the course is mapped to, B8-j).
    class_id: UUID | None = None
    course_id: UUID
    # Empty = whole class; one or more ids = one assignment row per section
    # (multi-section publish shares a batch_id, IMPLEMENT.md §5).
    section_ids: list[UUID] = []
    # Publish to every class the course is mapped to (whole-class rows,
    # sharing one batch_id) — requires assignments.manage_all. B8-j.
    all_classes: bool = False
    title: str
    category: str | None = Field(default=None, max_length=60)
    instructions: str
    attachment_key: str | None = None
    due_date: datetime
    max_marks: float | None = None
    weightage: float | None = None
    target_student_ids: list[UUID] = []

    @model_validator(mode="after")
    def _class_id_required_unless_all_classes(self) -> "AssignmentCreate":
        if not self.all_classes and self.class_id is None:
            raise ValueError("class_id is required unless all_classes is set")
        if self.all_classes and self.section_ids:
            raise ValueError("section_ids cannot be combined with all_classes")
        return self


class AssignmentUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    instructions: str | None = None
    attachment_key: str | None = None
    due_date: datetime | None = None
    max_marks: float | None = None
    weightage: float | None = None
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
    max_marks: float | None
    weightage: float | None
    target_student_ids: list | None
    created_by_id: UUID | None
    batch_id: UUID | None = None
    created_at: datetime
    # Display names (never show raw ids in the UI).
    class_name: str | None = None
    section_name: str | None = None
    course_name: str | None = None
    teacher_name: str | None = None
    submission_file_key: str | None = None
    submission_mark: float | None = None
    submission_feedback: str | None = None
    submitted_at: datetime | None = None


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
    student_name: str | None = None


class GradeBand(BaseModel):
    label: str
    min_score: float
    max_score: float


class GradingSchemeCreate(BaseModel):
    name: str
    bands: list[GradeBand] = Field(min_length=1)
    include_assignments: bool = False


class GradingSchemeUpdate(BaseModel):
    name: str | None = None
    bands: list[GradeBand] | None = None
    include_assignments: bool | None = None


class GradingSchemeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    bands: list
    include_assignments: bool = False


class ExamTypeCreate(BaseModel):
    course_id: UUID
    class_id: UUID | None = None
    name: str
    weightage: float = Field(gt=0)
    grading_scheme_id: UUID


class ExamTypeUpdate(BaseModel):
    course_id: UUID | None = None
    class_id: UUID | None = None
    name: str | None = None
    weightage: float | None = Field(default=None, gt=0)
    grading_scheme_id: UUID | None = None


class ExamTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    course_id: UUID
    class_id: UUID | None
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
