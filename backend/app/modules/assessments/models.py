from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, PortableJSONB, TenantMixin, TimestampMixin


class Assignment(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "assignments"

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"), index=True)
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    instructions: Mapped[str] = mapped_column(Text)
    attachment_key: Mapped[str] = mapped_column(String(255), nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Null/empty = whole class (FR-ASG-02); populated = only these students.
    target_student_ids: Mapped[list] = mapped_column(PortableJSONB, nullable=True)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), nullable=True)


class Submission(Base, IdMixin, TimestampMixin):
    __tablename__ = "submissions"

    assignment_id: Mapped[UUID] = mapped_column(ForeignKey("assignments.id"), index=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    file_key: Mapped[str] = mapped_column(String(255))
    mark: Mapped[float] = mapped_column(Float, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, nullable=True)


class GradingScheme(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "grading_schemes"

    name: Mapped[str] = mapped_column(String(160))
    bands: Mapped[list] = mapped_column(PortableJSONB)


class ExamType(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "exam_types"

    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    weightage: Mapped[float] = mapped_column(Float)
    grading_scheme_id: Mapped[UUID] = mapped_column(ForeignKey("grading_schemes.id"))


class Mark(Base, IdMixin, TimestampMixin):
    __tablename__ = "marks"
    __table_args__ = (UniqueConstraint("exam_type_id", "student_id", name="uq_mark_exam_student"),)

    exam_type_id: Mapped[UUID] = mapped_column(ForeignKey("exam_types.id"), index=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    score: Mapped[float] = mapped_column(Float)
    entered_by_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), nullable=True)


# Marks a student's session result visible to their portal (FR-RES-08).
# Results are always computed on the fly from Marks, never stored — a row
# here is the only durable publish-gate.
class ResultPublication(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "result_publications"
    __table_args__ = (UniqueConstraint("student_id", "session_id", name="uq_publication_student_session"),)

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    published_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
