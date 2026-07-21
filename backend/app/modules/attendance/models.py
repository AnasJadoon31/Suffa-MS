from typing import Optional
from datetime import date, datetime, time
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, String, Text, Time, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin


class AttendanceStatus(StrEnum):
    present = "present"
    absent = "absent"
    leave = "leave"


class StudentAttendance(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "student_attendance"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "session_id", "attendance_date", "timetable_slot_id",
            name="uq_student_attendance_period",
        ),
        CheckConstraint(
            "(course_id IS NULL) = (timetable_slot_id IS NULL)",
            name="ck_student_attendance_period_scope_complete",
        ),
        Index(
            "uq_student_attendance_legacy_day",
            "student_id", "session_id", "attendance_date",
            unique=True,
            postgresql_where=text("timetable_slot_id IS NULL"),
            sqlite_where=text("timetable_slot_id IS NULL"),
        ),
    )

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    # Null/null identifies a pre-period "general daily" record. New clients
    # supply both values and the API validates the slot against the enrolled
    # section and academic session before persisting it.
    course_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("courses.id"), index=True, nullable=True)
    timetable_slot_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("timetable_slots.id"), index=True, nullable=True
    )
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    marked_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    synced_late: Mapped[bool] = mapped_column(Boolean, default=False)
    overridden: Mapped[bool] = mapped_column(Boolean, default=False)


class TeacherAttendance(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "teacher_attendance"
    __table_args__ = (
        UniqueConstraint("teacher_id", "session_id", "attendance_date", name="uq_teacher_attendance_day"),
    )

    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus))
    check_in: Mapped[time] = mapped_column(Time, nullable=True)
    check_out: Mapped[time] = mapped_column(Time, nullable=True)
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    marked_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    synced_late: Mapped[bool] = mapped_column(Boolean, default=False)
    overridden: Mapped[bool] = mapped_column(Boolean, default=False)


class AttendanceCorrection(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "attendance_corrections"

    attendance_table: Mapped[str] = mapped_column(String(40))
    attendance_id: Mapped[UUID]
    old_value: Mapped[str] = mapped_column(Text)
    new_value: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
