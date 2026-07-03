from typing import Optional
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin


class MessageTemplate(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "message_templates"

    code: Mapped[str] = mapped_column(String(80), unique=True, index=True) # e.g. "performance_report"
    name: Mapped[str] = mapped_column(String(160))
    content: Mapped[dict] = mapped_column(JSONB) # {"en": "...", "ur": "..."}


class MessageLog(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "message_logs"

    template_code: Mapped[str] = mapped_column(String(80))
    recipient_number: Mapped[str] = mapped_column(String(32))
    recipient_type: Mapped[str] = mapped_column(String(32)) # guardian, student, teacher
    recipient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    dispatched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    content_sent: Mapped[str] = mapped_column(Text)
