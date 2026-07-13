from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.dependencies import get_current_madrasa, get_current_user, require_permission
from app.core.hijri import to_hijri_string
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.core.pdf import render_receipt_pdf
from app.db.session import get_session
from app.modules.academics.models import AcademicSession, Enrollment, Madrasa
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
    MySalaryRead,
    SalaryPaymentCreate,
    SalaryPaymentRead,
    SalaryRecordRead,
    SalaryRecordSet,
)
from app.modules.messaging.routes import _primary_guardian, render_and_dispatch
from app.modules.messaging.schemas import WhatsAppLinkResponse
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


async def _receipt_context(
    session: AsyncSession, madrasa: Madrasa, *, kind: str, row: Payment | Donation, payer_name: str
) -> dict[str, str]:
    category = await session.get(PaymentCategory, row.category_id)
    recorder = await session.get(User, row.recorded_by_id)
    row_date = row.payment_date if isinstance(row, Payment) else row.donation_date
    return {
        "madrasa_name": madrasa.name,
        "receipt_kind": kind,
        "receipt_number": str(row.id).split("-")[0].upper(),
        "payer_name": payer_name,
        "category_name": category.name if category else str(row.category_id),
        "amount": f"{float(row.amount):.2f}",
        "currency": row.currency,
        "payment_date": str(row_date),
        "hijri_date": to_hijri_string(row_date),
        "recorded_by": recorder.username if recorder else "—",
    }


def _receipt_response(context: dict[str, str], note: str | None) -> Response:
    pdf_bytes = render_receipt_pdf(**context, note=note)
    filename = f"receipt-{context['receipt_number'].lower()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    await session.flush()
    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="finance.payment_create",
        entity_name="payment",
        entity_id=str(payment.id),
        old_values={},
        new_values={
            "student_id": str(payload.student_id),
            "category_id": str(payload.category_id),
            "amount": str(payload.amount),
            "payment_date": str(payload.payment_date),
        },
    )
    await session.commit()
    await session.refresh(payment)
    return PaymentRead.model_validate(payment)


@router.get("/payments", response_model=list[PaymentRead])
async def list_payments(
    response: Response,
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    student_id: UUID | None = None,
    class_id: UUID | None = None,
    category_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[PaymentRead]:
    stmt = select(Payment).where(Payment.madrasa_id == madrasa.id)
    if student_id:
        stmt = stmt.where(Payment.student_id == student_id)
    if class_id:
        # Fees organised by class (B13-a): students of the class in the
        # active session.
        class_student_ids = (
            await session.execute(
                select(Enrollment.student_id)
                .join(AcademicSession, AcademicSession.id == Enrollment.session_id)
                .where(Enrollment.class_id == class_id, AcademicSession.is_active.is_(True))
            )
        ).scalars().all()
        if not class_student_ids:
            response.headers["X-Total-Count"] = "0"
            return []
        stmt = stmt.where(Payment.student_id.in_(class_student_ids))
    if category_id:
        stmt = stmt.where(Payment.category_id == category_id)
    if date_from:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.payment_date <= date_to)
    rows = await paginate_scalars(
        session, stmt.order_by(Payment.payment_date.desc()), limit=limit, offset=offset, response=response
    )
    return [PaymentRead.model_validate(row) for row in rows]


@router.get("/payments/{payment_id}/receipt")
async def payment_receipt(
    payment_id: UUID,
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    payment = await session.get(Payment, payment_id)
    if payment is None or payment.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Payment not found")
    student = await session.get(StudentProfile, payment.student_id)
    context = await _receipt_context(
        session, madrasa, kind="Contribution", row=payment, payer_name=student.name if student else "—"
    )
    return _receipt_response(context, payment.note)


@router.post("/payments/{payment_id}/receipt-share", response_model=WhatsAppLinkResponse)
async def share_payment_receipt(
    payment_id: UUID,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppLinkResponse:
    payment = await session.get(Payment, payment_id)
    if payment is None or payment.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Payment not found")
    student = await session.get(StudentProfile, payment.student_id)
    guardian = await _primary_guardian(session, payment.student_id)
    context = await _receipt_context(
        session, madrasa, kind="Contribution", row=payment, payer_name=student.name if student else "—"
    )
    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code="receipt",
        language=guardian.preferred_language,
        variables={
            "payer_name": context["payer_name"],
            "amount": f"{context['amount']} {context['currency']}",
            "category": context["category_name"],
            "date": context["payment_date"],
            "receipt_no": context["receipt_number"],
            "madrasa_name": madrasa.name,
        },
        recipient_type="guardian",
        recipient_id=guardian.id,
        phone_number=guardian.phone_numbers.split(",")[0].strip(),
    )


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
    response: Response,
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[DonorRead]:
    stmt = select(Donor).where(Donor.madrasa_id == madrasa.id)
    rows = await paginate_scalars(session, stmt.order_by(Donor.name), limit=limit, offset=offset, response=response)
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
    await session.flush()
    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="finance.donation_create",
        entity_name="donation",
        entity_id=str(donation.id),
        old_values={},
        new_values={
            "donor_id": str(payload.donor_id),
            "category_id": str(payload.category_id),
            "amount": str(payload.amount),
            "donation_date": str(payload.donation_date),
        },
    )
    await session.commit()
    await session.refresh(donation)
    return DonationRead.model_validate(donation)


@router.get("/donations", response_model=list[DonationRead])
async def list_donations(
    response: Response,
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    donor_id: UUID | None = None,
    category_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[DonationRead]:
    stmt = select(Donation).where(Donation.madrasa_id == madrasa.id)
    if donor_id:
        stmt = stmt.where(Donation.donor_id == donor_id)
    if category_id:
        stmt = stmt.where(Donation.category_id == category_id)
    if date_from:
        stmt = stmt.where(Donation.donation_date >= date_from)
    if date_to:
        stmt = stmt.where(Donation.donation_date <= date_to)
    rows = await paginate_scalars(
        session, stmt.order_by(Donation.donation_date.desc()), limit=limit, offset=offset, response=response
    )
    return [DonationRead.model_validate(row) for row in rows]


@router.get("/donations/{donation_id}/receipt")
async def donation_receipt(
    donation_id: UUID,
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    donation = await session.get(Donation, donation_id)
    if donation is None or donation.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Donation not found")
    donor = await session.get(Donor, donation.donor_id)
    context = await _receipt_context(
        session, madrasa, kind="Donation", row=donation, payer_name=donor.name if donor else "—"
    )
    return _receipt_response(context, donation.note)


@router.post("/donations/{donation_id}/receipt-share", response_model=WhatsAppLinkResponse)
async def share_donation_receipt(
    donation_id: UUID,
    current_user: User = Depends(require_permission("finance.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppLinkResponse:
    donation = await session.get(Donation, donation_id)
    if donation is None or donation.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Donation not found")
    donor = await session.get(Donor, donation.donor_id)
    if donor is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    context = await _receipt_context(session, madrasa, kind="Donation", row=donation, payer_name=donor.name)
    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code="receipt",
        language="ur",
        variables={
            "payer_name": donor.name,
            "amount": f"{context['amount']} {context['currency']}",
            "category": context["category_name"],
            "date": context["payment_date"],
            "receipt_no": context["receipt_number"],
            "madrasa_name": madrasa.name,
        },
        recipient_type="donor",
        recipient_id=donor.id,
        phone_number=donor.contact,
    )


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
        old_values = {}
        record = SalaryRecord(madrasa_id=madrasa.id, teacher_id=teacher_id, **payload.model_dump())
        session.add(record)
        await session.flush()
    else:
        old_values = {"amount": str(record.amount), "effective_from": str(record.effective_from)}
        for field, value in payload.model_dump().items():
            setattr(record, field, value)

    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="finance.salary_set",
        entity_name="salary_record",
        entity_id=str(record.id),
        old_values=old_values,
        new_values={"teacher_id": str(teacher_id), "amount": str(payload.amount), "effective_from": str(payload.effective_from)},
    )
    await session.commit()
    await session.refresh(record)
    return SalaryRecordRead.model_validate(record)


@router.get("/salary/me", response_model=MySalaryRead)
async def get_my_salary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MySalaryRead:
    """Self-scoped read for a teacher's own salary record + payment history.
    Registered before the `/salary/{teacher_id}` GET route so "me" is never
    swallowed as a UUID path parameter."""
    teacher = (
        await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if teacher is None:
        raise HTTPException(status_code=403, detail="Only teacher accounts have salary records")

    record = (
        await session.execute(select(SalaryRecord).where(SalaryRecord.teacher_id == teacher.id))
    ).scalar_one_or_none()
    payments = (
        await session.execute(
            select(SalaryPayment)
            .where(SalaryPayment.teacher_id == teacher.id)
            .order_by(SalaryPayment.payment_date.desc())
        )
    ).scalars().all()
    return MySalaryRead(
        record=SalaryRecordRead.model_validate(record) if record else None,
        payments=[SalaryPaymentRead.model_validate(p) for p in payments],
    )


@router.get("/salary/{teacher_id}", response_model=SalaryRecordRead)
async def get_salary(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SalaryRecordRead:
    # IDOR fix: this route previously had no tenant scoping at all — a
    # caller holding teachers.salary.manage (a role/permission check with no
    # tenant scope of its own) could read another madrasa's salary record
    # just by guessing/knowing its teacher_id.
    teacher = await session.get(TeacherProfile, teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")
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
    await session.flush()
    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="finance.salary_payment_create",
        entity_name="salary_payment",
        entity_id=str(payment.id),
        old_values={},
        new_values={
            "teacher_id": str(teacher_id),
            "amount": str(payload.amount),
            "payment_date": str(payload.payment_date),
            "period_covered": payload.period_covered,
        },
    )
    await session.commit()
    await session.refresh(payment)
    return SalaryPaymentRead.model_validate(payment)


@router.get("/salary/{teacher_id}/payments", response_model=list[SalaryPaymentRead])
async def list_salary_payments(
    teacher_id: UUID,
    response: Response,
    current_user: User = Depends(require_permission("teachers.salary.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[SalaryPaymentRead]:
    # IDOR fix: same gap as GET /salary/{teacher_id} — no tenant check at all.
    teacher = await session.get(TeacherProfile, teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")
    stmt = select(SalaryPayment).where(SalaryPayment.teacher_id == teacher_id)
    rows = await paginate_scalars(
        session, stmt.order_by(SalaryPayment.payment_date.desc()), limit=limit, offset=offset, response=response
    )
    return [SalaryPaymentRead.model_validate(row) for row in rows]
