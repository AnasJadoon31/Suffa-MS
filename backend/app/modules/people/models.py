from typing import Optional
from datetime import date
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, column_property, declared_attr, mapped_column

from app.db.base import Base, IdMixin, PortableJSONB, TenantMixin, TimestampMixin
from app.modules.auth.models import User
from app.modules.academics.models import Enrollment, AcademicClass


class TeacherProfile(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "teacher_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    employee_code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    whatsapp_number: Mapped[str] = mapped_column(String(32))
    qualifications: Mapped[str] = mapped_column(Text, nullable=True)
    join_date: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")
    is_principal_delegate: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # Formal-record fields (§11): identity + contacts + photo.
    cnic: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    photo_file_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("file_objects.id"), nullable=True)


class StudentProfile(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "student_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    admission_number: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    date_of_birth: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="active")
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Formal-record fields (§11).
    b_form_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_file_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("file_objects.id"), nullable=True)

    @declared_attr
    def username(cls) -> Mapped[Optional[str]]:
        return column_property(
            select(User.username)
            .where(User.id == cls.user_id)
            .correlate_except(User)
            .scalar_subquery()
        )

    @declared_attr
    def current_class(cls) -> Mapped[Optional[str]]:
        return column_property(
            select(AcademicClass.name)
            .select_from(Enrollment)
            .join(AcademicClass, Enrollment.class_id == AcademicClass.id)
            .where(Enrollment.student_id == cls.id, Enrollment.ended_on.is_(None))
            .order_by(Enrollment.created_at.desc())
            .limit(1)
            .correlate_except(Enrollment, AcademicClass)
            .scalar_subquery()
        )


class Guardian(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "guardians"

    # Set once the guardian is provisioned a portal login (role=parent, B7-k).
    user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    relationship: Mapped[str] = mapped_column(String(80))
    phone_numbers: Mapped[str] = mapped_column(Text)
    cnic: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(8), default="ur")


class StudentGuardian(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "student_guardians"
    __table_args__ = (
        UniqueConstraint("student_id", "guardian_id", name="uq_student_guardian"),
    )

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"))
    guardian_id: Mapped[UUID] = mapped_column(ForeignKey("guardians.id"))
    relationship: Mapped[str] = mapped_column(String(80), default="guardian")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    portal_access: Mapped[bool] = mapped_column(Boolean, default=True)


class StudentAdmissionRecord(Base, IdMixin, TenantMixin, TimestampMixin):
    """Immutable admission context retained with a student.

    The live form/application foreign keys are navigational only.  The copied
    title, schema and answers remain authoritative if a template is edited or
    deleted later.
    """

    __tablename__ = "student_admission_records"
    __table_args__ = (
        UniqueConstraint("student_id", name="uq_student_admission_record_student"),
        UniqueConstraint("application_id", name="uq_student_admission_record_application"),
    )

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    form_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("admission_forms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    application_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("admission_applications.id", ondelete="SET NULL"), nullable=True, index=True
    )
    form_title: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    fields_definition: Mapped[list] = mapped_column(PortableJSONB, default=list)
    answers: Mapped[dict] = mapped_column(PortableJSONB, default=dict)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
