from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, require_permission
from app.db.session import get_session
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User
from app.modules.finance.models import Donation, Donor, Payment, PaymentCategory, SalaryPayment, SalaryRecord
from app.modules.finance.schemas import (
    DonationCreate,
    DonationRead,
    DonorCreate,
    DonorRead,
    FinanceSummary,
    PaymentCategoryCreate,
    PaymentCategoryRead,
    PaymentCreate,
    PaymentRead,
    SalaryPaymentCreate,
    SalaryPaymentRead,
    SalaryRecordRead,
    SalaryRecordSet,
)
from app.modules.people.models import TeacherProfile

router = APIRouter()


# ------------------------------------------------------------------ Categories

@router.post("/categories", response_model=PaymentCategoryRead)
async def create_category(
    payload: PaymentCategoryCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> PaymentCategoryRead:
    category = PaymentCategory(madrasa_id=madrasa.id, name=payload.name)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return PaymentCategoryRead.model_validate(category)


@router.get("/categories", response_model=list[PaymentCategoryRead])
async def list_categories(
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[PaymentCategoryRead]:
    rows = (await session.execute(select(PaymentCategory).where(PaymentCategory.madrasa_id == madrasa.id))).scalars().all()
    return [PaymentCategoryRead.model_validate(row) for row in rows]


# ------------------------------------------------------------ Student contributions

@router.post("/payments", response_model=PaymentRead)
async def create_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> PaymentRead:
    payment = Payment(madrasa_id=madrasa.id, recorded_by_id=current_user.id, **payload.model_dump())
    session.add(payment)
    await session.commit()
    await session.refresh(payment)
    return PaymentRead.model_validate(payment)


@router.get("/payments", response_model=list[PaymentRead])
async def list_payments(
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    student_id: UUID | None = None,
    category_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[PaymentRead]:
    stmt = select(Payment).where(Payment.madrasa_id == madrasa.id)
    if student_id:
        stmt = stmt.where(Payment.student_id == student_id)
    if category_id:
        stmt = stmt.where(Payment.category_id == category_id)
    if date_from:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.payment_date <= date_to)
    rows = (await session.execute(stmt.order_by(Payment.payment_date.desc()))).scalars().all()
    return [PaymentRead.model_validate(row) for row in rows]


# --------------------------------------------------------------- Donors/Donations

@router.post("/donors", response_model=DonorRead)
async def create_donor(
    payload: DonorCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> DonorRead:
    donor = Donor(madrasa_id=madrasa.id, name=payload.name, contact=payload.contact)
    session.add(donor)
    await session.commit()
    await session.refresh(donor)
    return DonorRead.model_validate(donor)


@router.get("/donors", response_model=list[DonorRead])
async def list_donors(
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[DonorRead]:
    rows = (await session.execute(select(Donor).where(Donor.madrasa_id == madrasa.id))).scalars().all()
    return [DonorRead.model_validate(row) for row in rows]


@router.post("/donations", response_model=DonationRead)
async def create_donation(
    payload: DonationCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> DonationRead:
    donor = await session.get(Donor, payload.donor_id)
    if donor is None or donor.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Donor not found")
    donation = Donation(madrasa_id=madrasa.id, recorded_by_id=current_user.id, **payload.model_dump())
    session.add(donation)
    await session.commit()
    await session.refresh(donation)
    return DonationRead.model_validate(donation)


@router.get("/donations", response_model=list[DonationRead])
async def list_donations(
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    donor_id: UUID | None = None,
) -> list[DonationRead]:
    stmt = select(Donation).where(Donation.madrasa_id == madrasa.id)
    if donor_id:
        stmt = stmt.where(Donation.donor_id == donor_id)
    rows = (await session.execute(stmt.order_by(Donation.donation_date.desc()))).scalars().all()
    return [DonationRead.model_validate(row) for row in rows]


# --------------------------------------------------------------------- Reporting

@router.get("/summary", response_model=FinanceSummary)
async def finance_summary(
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    date_from: date | None = None,
    date_to: date | None = None,
) -> FinanceSummary:
    payment_stmt = select(Payment).where(Payment.madrasa_id == madrasa.id)
    donation_stmt = select(Donation).where(Donation.madrasa_id == madrasa.id)
    if date_from:
        payment_stmt = payment_stmt.where(Payment.payment_date >= date_from)
        donation_stmt = donation_stmt.where(Donation.donation_date >= date_from)
    if date_to:
        payment_stmt = payment_stmt.where(Payment.payment_date <= date_to)
        donation_stmt = donation_stmt.where(Donation.donation_date <= date_to)

    payments = (await session.execute(payment_stmt)).scalars().all()
    donations = (await session.execute(donation_stmt)).scalars().all()
    categories = {
        row.id: row.name
        for row in (await session.execute(select(PaymentCategory).where(PaymentCategory.madrasa_id == madrasa.id))).scalars().all()
    }

    by_category: dict[str, float] = {}
    for row in list(payments) + list(donations):
        name = categories.get(row.category_id, str(row.category_id))
        by_category[name] = by_category.get(name, 0.0) + float(row.amount)

    total_contributions = sum(float(p.amount) for p in payments)
    total_donations = sum(float(d.amount) for d in donations)
    return FinanceSummary(
        total_contributions=total_contributions,
        total_donations=total_donations,
        total=total_contributions + total_donations,
        by_category=by_category,
    )


# -------------------------------------------------------------------- Salary

@router.put("/salary/{teacher_id}", response_model=SalaryRecordRead)
async def set_salary(
    teacher_id: UUID,
    payload: SalaryRecordSet,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SalaryRecordRead:
    teacher = await session.get(TeacherProfile, teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")

    record = (
        await session.execute(select(SalaryRecord).where(SalaryRecord.teacher_id == teacher_id))
    ).scalar_one_or_none()
    if record is None:
        record = SalaryRecord(madrasa_id=madrasa.id, teacher_id=teacher_id, **payload.model_dump())
        session.add(record)
    else:
        for field, value in payload.model_dump().items():
            setattr(record, field, value)

    await session.commit()
    await session.refresh(record)
    return SalaryRecordRead.model_validate(record)


@router.get("/salary/{teacher_id}", response_model=SalaryRecordRead)
async def get_salary(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    session: AsyncSession = Depends(get_session),
) -> SalaryRecordRead:
    record = (
        await session.execute(select(SalaryRecord).where(SalaryRecord.teacher_id == teacher_id))
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="No salary record set for this teacher")
    return SalaryRecordRead.model_validate(record)


@router.post("/salary/{teacher_id}/payments", response_model=SalaryPaymentRead)
async def record_salary_payment(
    teacher_id: UUID,
    payload: SalaryPaymentCreate,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SalaryPaymentRead:
    teacher = await session.get(TeacherProfile, teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")
    payment = SalaryPayment(
        madrasa_id=madrasa.id, teacher_id=teacher_id, recorded_by_id=current_user.id, **payload.model_dump()
    )
    session.add(payment)
    await session.commit()
    await session.refresh(payment)
    return SalaryPaymentRead.model_validate(payment)


@router.get("/salary/{teacher_id}/payments", response_model=list[SalaryPaymentRead])
async def list_salary_payments(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    session: AsyncSession = Depends(get_session),
) -> list[SalaryPaymentRead]:
    rows = (
        await session.execute(select(SalaryPayment).where(SalaryPayment.teacher_id == teacher_id))
    ).scalars().all()
    return [SalaryPaymentRead.model_validate(row) for row in rows]
