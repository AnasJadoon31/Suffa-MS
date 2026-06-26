from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class IdMixin:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class TenantMixin:
    madrasa_id: Mapped[UUID] = mapped_column(ForeignKey("madaris.id"), index=True)


class SlugMixin:
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
