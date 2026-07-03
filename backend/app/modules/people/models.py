from typing import Optional
from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin


class TeacherProfile(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "teacher_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    employee_code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    whatsapp_number: Mapped[str] = mapped_column(String(32))
    qualifications: Mapped[str] = mapped_column(Text, nullable=True)
    join_date: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")
    notes: Mapped[str] = mapped_column(Text, nullable=True)


class StudentProfile(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "student_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    admission_number: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    date_of_birth: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="active")
    notes: Mapped[str] = mapped_column(Text, nullable=True)


class Guardian(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "guardians"

    name: Mapped[str] = mapped_column(String(160))
    relationship: Mapped[str] = mapped_column(String(80))
    phone_numbers: Mapped[str] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(String(8), default="ur")


class StudentGuardian(Base, IdMixin, TimestampMixin):
    __tablename__ = "student_guardians"

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"))
    guardian_id: Mapped[UUID] = mapped_column(ForeignKey("guardians.id"))
