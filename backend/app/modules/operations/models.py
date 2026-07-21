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
    # e.g. religious / national / madrasa / exam-break — free-form category.
    category: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    # Null/empty = madrasa-wide; else the holiday applies only to these
    # classes (B4-c) — attendance summaries respect this scope.
    class_ids: Mapped[Optional[list]] = mapped_column(PortableJSONB, nullable=True)


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
    # Null = global/shared category (visible to everyone); set = private to
    # that teacher (B9 — per-teacher categories). Admins/resources.manage_all
    # see every category, global or not.
    owner_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)


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
    # Free-form label (B10), same pattern as Assignment.category — filterable,
    # not a managed table.
    category: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    fields_definition: Mapped[list] = mapped_column(PortableJSONB) # Array of field definitions
    visibility_scope: Mapped[dict] = mapped_column(PortableJSONB)
    open_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    open_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class FormResponse(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "form_responses"

    form_id: Mapped[UUID] = mapped_column(ForeignKey("forms.id"), index=True)
    student_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("student_profiles.id"), index=True, nullable=True)
    submitted_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    response_data: Mapped[dict] = mapped_column(PortableJSONB)


class Announcement(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    # Free-form label (B6), same pattern as Assignment.category — filterable,
    # not a managed table.
    category: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
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


class AdmissionForm(Base, IdMixin, TenantMixin, TimestampMixin):
    """Public admission form for one program — shareable like a Google Form
    via its token (B12-c). Submissions land as AdmissionApplication rows."""

    __tablename__ = "admission_forms"

    program_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("programs.id"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(60), default="General")
    description: Mapped[str] = mapped_column(Text, default="")
    # Extra questions beyond the built-in applicant fields; same field shape
    # as Form.fields_definition.
    fields_definition: Mapped[list] = mapped_column(PortableJSONB, default=list)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class AdmissionApplication(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "admission_applications"

    applicant_name: Mapped[str] = mapped_column(String(160))
    guardian_contact: Mapped[str] = mapped_column(String(60))
    program_id: Mapped[UUID] = mapped_column(ForeignKey("programs.id"), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending") # pending, accepted, rejected
    status_history: Mapped[list] = mapped_column(PortableJSONB, default=list)
    # Set when the application arrived through a public admission form.
    form_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("admission_forms.id"), nullable=True, index=True)
    extra_data: Mapped[Optional[dict]] = mapped_column(PortableJSONB, nullable=True)
    form_title_snapshot: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    fields_definition_snapshot: Mapped[list] = mapped_column(PortableJSONB, default=list)
    converted_student_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("student_profiles.id"), nullable=True, unique=True, index=True
    )
    converted_guardian_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("guardians.id"), nullable=True, index=True
    )
    converted_by_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    converted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class AdminNotification(Base, IdMixin, TenantMixin, TimestampMixin):
    """Tenant-wide durable notification intended for principals/admin staff."""

    __tablename__ = "admin_notifications"

    event_type: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[Optional[UUID]] = mapped_column(nullable=True, index=True)
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    # User IDs are stored as strings so PortableJSONB works identically on
    # PostgreSQL and SQLite.  This is a small tenant-wide audience, not an
    # unbounded delivery log.
    read_by_user_ids: Mapped[list] = mapped_column(PortableJSONB, default=list)


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
