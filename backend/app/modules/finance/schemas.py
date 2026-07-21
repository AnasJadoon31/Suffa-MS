from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCategoryCreate(BaseModel):
    name: str


class PaymentCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str


class PaymentCreate(BaseModel):
    student_id: UUID
    category_id: UUID
    amount: float = Field(gt=0)
    currency: str = "PKR"
    payment_date: date
    note: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    student_id: UUID
    category_id: UUID
    amount: float
    currency: str
    payment_date: date
    note: str | None
    recorded_by_id: UUID
    student_name: str | None = None
    category_name: str | None = None


class DonorCreate(BaseModel):
    name: str
    contact: str


class DonorUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None


class DonorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    contact: str


class DonationCreate(BaseModel):
    donor_id: UUID
    category_id: UUID
    amount: float = Field(gt=0)
    currency: str = "PKR"
    donation_date: date
    note: str | None = None


class DonationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    donor_id: UUID
    category_id: UUID
    amount: float
    currency: str
    donation_date: date
    note: str | None
    recorded_by_id: UUID
    donor_name: str | None = None
    category_name: str | None = None


class FinanceSummary(BaseModel):
    total_contributions: float
    total_donations: float
    total: float
    by_category: dict[str, float]


class SalaryRecordSet(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "PKR"
    effective_from: date


class SalaryRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    teacher_id: UUID
    amount: float
    currency: str
    effective_from: date


class SalaryPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "PKR"
    payment_date: date
    period_covered: str
    method: str
    note: str = ""


class SalaryPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    teacher_id: UUID
    amount: float
    currency: str
    payment_date: date
    period_covered: str
    method: str
    note: str
    recorded_by_id: UUID
    created_at: datetime


class MySalaryRead(BaseModel):
    """Self-scoped view for a teacher: own salary record + payment history."""
    record: SalaryRecordRead | None = None
    payments: list[SalaryPaymentRead] = []
