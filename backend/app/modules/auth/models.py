from typing import Optional
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class UserRole(StrEnum):
    super_admin = "super_admin"
    principal = "principal"
    teacher = "teacher"
    student = "student"


class UserStatus(StrEnum):
    invited = "invited"
    active = "active"
    disabled = "disabled"


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    # NULL for super admins, who operate at platform scope, above any tenant.
    madrasa_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("madaris.id"), index=True, nullable=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole))
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.invited)
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Per-user academic-session context. Nullable = follow the active session.
    # Stored server-side so two logins on one browser can't clobber each other.
    selected_session_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("academic_sessions.id", ondelete="SET NULL"), nullable=True
    )


class UserPermission(Base, IdMixin, TimestampMixin):
    __tablename__ = "user_permissions"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    permission_code: Mapped[str] = mapped_column(String(120), index=True)
    granted_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    # Optional scope narrowing a grant to one class/section ("mini-admin"
    # delegation). Both NULL = the grant applies madrasa-wide.
    scope_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    scope_id: Mapped[Optional[UUID]] = mapped_column(nullable=True)
