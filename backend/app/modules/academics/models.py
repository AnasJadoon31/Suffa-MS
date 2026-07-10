from typing import Optional
from datetime import date
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, SlugMixin, TenantMixin, TimestampMixin


class Madrasa(Base, IdMixin, SlugMixin, TimestampMixin):
    __tablename__ = "madaris"

    name: Mapped[str] = mapped_column(String(160))
    content_language: Mapped[str] = mapped_column(String(8), default="ur")


class Program(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "programs"

    name: Mapped[str] = mapped_column(String(160))


class AcademicClass(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "classes"

    program_id: Mapped[UUID] = mapped_column(ForeignKey("programs.id"))
    name: Mapped[str] = mapped_column(String(160))
    default_portal_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Section(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "sections"

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"))
    name: Mapped[str] = mapped_column(String(80))


class Course(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "courses"

    name: Mapped[str] = mapped_column(String(160))


class ClassCourse(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "class_courses"
    __table_args__ = (
        UniqueConstraint("class_id", "course_id", name="uq_class_course"),
    )

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"), index=True)
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), index=True)


class AcademicSession(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "academic_sessions"

    name: Mapped[str] = mapped_column(String(160))
    gregorian_start: Mapped[date] = mapped_column(Date)
    gregorian_end: Mapped[date] = mapped_column(Date)
    hijri_span: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class Enrollment(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "session_id", name="uq_enrollment_student_session"),
    )

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    program_id: Mapped[UUID] = mapped_column(ForeignKey("programs.id"))
    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"))
    section_id: Mapped[UUID] = mapped_column(ForeignKey("sections.id"))


class TeacherAssignment(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "teacher_assignments"

    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
