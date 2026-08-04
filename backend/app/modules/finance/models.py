from typing import Optional
from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Numeric, String, Text, select
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin
from app.modules.auth.models import User


class PaymentCategory(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "payment_categories"

    name: Mapped[str] = mapped_column(String(80))


class Payment(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "payments"

    student_id: Mapped[UUID] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    category_id: Mapped[UUID] = mapped_column(ForeignKey("payment_categories.id"))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR")
    payment_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, nullable=True)
    recorded_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class Donor(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "donors"

    name: Mapped[str] = mapped_column(String(160))
    contact: Mapped[str] = mapped_column(String(80))
    user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)

    username: Mapped[Optional[str]] = column_property(
        select(User.username).where(User.id == user_id).correlate_except(User).scalar_subquery()
    )


class Donation(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "donations"

    donor_id: Mapped[UUID] = mapped_column(ForeignKey("donors.id"), index=True)
    category_id: Mapped[UUID] = mapped_column(ForeignKey("payment_categories.id"))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR")
    donation_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, nullable=True)
    recorded_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))


class SalaryRecord(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "salary_records"

    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), unique=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR")
    effective_from: Mapped[date] = mapped_column(Date)


class SalaryPayment(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "salary_payments"

    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("teacher_profiles.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR")
    payment_date: Mapped[date] = mapped_column(Date)
    period_covered: Mapped[str] = mapped_column(String(80)) # e.g. "June 2026"
    method: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(Text)
    recorded_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
