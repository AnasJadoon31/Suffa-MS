from typing import Optional
from datetime import date, datetime, time
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin


class AttendanceStatus(StrEnum):
    present = "present"
    absent = "absent"
    leave = "leave"


class StudentAttendance(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "student_attendance"

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("academic_sessions.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    marked_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    synced_late: Mapped[bool] = mapped_column(Boolean, default=False)


class TeacherAttendance(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "teacher_attendance"

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


class AttendanceCorrection(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "attendance_corrections"

    attendance_table: Mapped[str] = mapped_column(String(40))
    attendance_id: Mapped[UUID]
    old_value: Mapped[str] = mapped_column(Text)
    new_value: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
