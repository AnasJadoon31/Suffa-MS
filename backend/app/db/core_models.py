from typing import Optional
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, PortableJSONB, TenantMixin, TimestampMixin


class FileObject(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "file_objects"

    object_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    content_type: Mapped[str] = mapped_column(String(80))
    file_size: Mapped[int] = mapped_column()
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    scope: Mapped[str] = mapped_column(String(80), default="private") # e.g. public, private


class AuditLog(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "audit_logs"

    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(160), index=True)
    entity_name: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(80))
    old_values: Mapped[dict] = mapped_column(PortableJSONB)
    new_values: Mapped[dict] = mapped_column(PortableJSONB)
    action_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
