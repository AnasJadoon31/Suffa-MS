from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class MadrasaFeature(Base, IdMixin, TimestampMixin):
    """Super-admin-controlled feature flag. No row = feature enabled.

    Intentionally NOT TenantMixin-scoped through the usual application scoping:
    only platform endpoints may write here, so a principal has no code path to
    override a super admin's decision.
    """

    __tablename__ = "madrasa_features"
    __table_args__ = (UniqueConstraint("madrasa_id", "feature_key", name="uq_madrasa_feature"),)

    madrasa_id: Mapped[UUID] = mapped_column(ForeignKey("madaris.id"), index=True)
    feature_key: Mapped[str] = mapped_column(String(40))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    set_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
