from datetime import date, datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, Integer, UniqueConstraint

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, PortableJSONB, TenantMixin, TimestampMixin


class TimetableSlot(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "timetable_slots"

    # Timetables are per academic session; the slot is also the source of
    # truth for "which teacher teaches which course in which section"
    # (IMPLEMENT.md §4). Nullable only for pre-migration legacy rows.
    session_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("academic_sessions.id"), index=True, nullable=True
    )
    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id"), index=True)
    section_id: Mapped[UUID] = mapped_column(ForeignKey("sections.id"), index=True)
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), index=True)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer) # e.g., 0=Monday
    period: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(String(20))
    end_time: Mapped[str] = mapped_column(String(20))


class Holiday(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "holidays"

    name: Mapped[str] = mapped_column(String(160))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)


class Leave(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "leaves"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending") # pending, approved, rejected


class ResourceCategory(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "resource_categories"

    name: Mapped[str] = mapped_column(String(80))


class Resource(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "resources"

    category_id: Mapped[UUID] = mapped_column(ForeignKey("resource_categories.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    file_key: Mapped[str] = mapped_column(String(255), nullable=True)
    video_url: Mapped[str] = mapped_column(String(255), nullable=True)
    visibility_scope: Mapped[dict] = mapped_column(PortableJSONB) # e.g. {"all": true} or {"classes": [id1, id2]}
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class Form(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "forms"

    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    fields_definition: Mapped[list] = mapped_column(PortableJSONB) # Array of field definitions
    visibility_scope: Mapped[dict] = mapped_column(PortableJSONB)
    open_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    open_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class FormResponse(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "form_responses"

    form_id: Mapped[UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    submitted_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    response_data: Mapped[dict] = mapped_column(PortableJSONB)


class Announcement(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    attachment_link: Mapped[str] = mapped_column(String(500), nullable=True)
    audience_scope: Mapped[dict] = mapped_column(PortableJSONB) # e.g. {"all": true} or {"classes": [id1, id2]}
    publish_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class BlogPost(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "blog_posts"

    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    publish_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class AdmissionApplication(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "admission_applications"

    applicant_name: Mapped[str] = mapped_column(String(160))
    guardian_contact: Mapped[str] = mapped_column(String(60))
    program_id: Mapped[UUID] = mapped_column(ForeignKey("programs.id"), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending") # pending, accepted, rejected


class ContactEnquiry(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "contact_enquiries"

    name: Mapped[str] = mapped_column(String(160))
    contact: Mapped[str] = mapped_column(String(160))  # email or phone
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="new")  # new, reviewed


class MadrasaSetting(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "madrasa_settings"
    __table_args__ = (UniqueConstraint("madrasa_id", "key", name="uq_setting_madrasa_key"),)

    key: Mapped[str] = mapped_column(String(120))
    value: Mapped[str] = mapped_column(Text)
