from datetime import UTC, datetime
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, require_permission
from app.db.session import get_session
from app.modules.academics.models import Course, Madrasa
from app.modules.assessments.models import ExamType, Mark, ResultPublication
from app.modules.auth.models import User
from app.modules.messaging.models import MessageLog, MessageTemplate
from app.modules.messaging.schemas import (
    MessageTemplateCreate,
    MessageTemplateRead,
    SendCredentialsRequest,
    SendReportRequest,
    WhatsAppLinkRequest,
    WhatsAppLinkResponse,
)
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile, TeacherProfile

router = APIRouter()


def normalise_phone_number(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if digits.startswith("0"):
        return "92" + digits[1:]
    if len(digits) == 10 and digits.startswith("3"):
        return "92" + digits
    return digits


def render_variables(template_text: str, variables: dict[str, str]) -> str:
    message = template_text
    for key, value in variables.items():
        message = message.replace("{" + key + "}", value)
    return message


async def render_and_dispatch(
    session: AsyncSession,
    *,
    madrasa: Madrasa,
    current_user: User,
    template_code: str,
    language: str,
    variables: dict[str, str],
    recipient_type: str,
    recipient_id: UUID,
    phone_number: str,
) -> WhatsAppLinkResponse:
    template = (
        await session.execute(
            select(MessageTemplate).where(
                MessageTemplate.madrasa_id == madrasa.id, MessageTemplate.code == template_code
            )
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail=f"No message template registered for code '{template_code}'")

    content = template.content.get(language) or next(iter(template.content.values()), "")
    message = render_variables(content, variables)
    number = normalise_phone_number(phone_number)

    session.add(
        MessageLog(
            madrasa_id=madrasa.id,
            template_code=template_code,
            recipient_number=number,
            recipient_type=recipient_type,
            recipient_id=recipient_id,
            dispatched_at=datetime.now(UTC),
            sent_by_id=current_user.id,
            content_sent=message,
        )
    )
    await session.commit()

    return WhatsAppLinkResponse(normalised_number=number, url=f"https://wa.me/{number}?text={quote(message)}")


@router.post("/whatsapp-link", response_model=WhatsAppLinkResponse)
async def whatsapp_link(
    payload: WhatsAppLinkRequest,
    current_user: User = Depends(require_permission("messaging.send")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppLinkResponse:
    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code=payload.template_code,
        language=payload.language,
        variables=payload.variables,
        recipient_type=payload.recipient_type,
        recipient_id=payload.recipient_id,
        phone_number=payload.phone_number,
    )


async def _primary_guardian(session: AsyncSession, student_id: UUID) -> Guardian:
    guardian = (
        await session.execute(
            select(Guardian)
            .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
            .where(StudentGuardian.student_id == student_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if guardian is None:
        raise HTTPException(status_code=404, detail="Student has no guardian on file to message")
    return guardian


@router.post("/send-report", response_model=WhatsAppLinkResponse)
async def send_report(
    payload: SendReportRequest,
    current_user: User = Depends(require_permission("messaging.send")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppLinkResponse:
    student = await session.get(StudentProfile, payload.student_id)
    if student is None or student.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Student not found")

    publication = (
        await session.execute(
            select(ResultPublication)
            .where(ResultPublication.student_id == student.id, ResultPublication.madrasa_id == madrasa.id)
            .order_by(ResultPublication.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if publication is None:
        raise HTTPException(status_code=404, detail="No published result for this student yet")

    rows = (
        await session.execute(
            select(Course.name, Mark.score)
            .select_from(Mark)
            .join(ExamType, ExamType.id == Mark.exam_type_id)
            .join(Course, Course.id == ExamType.course_id)
            .where(Mark.student_id == student.id)
        )
    ).all()
    results_summary = ", ".join(f"{name}: {score:g}" for name, score in rows) or "N/A"

    guardian = await _primary_guardian(session, student.id)
    phone = guardian.phone_numbers.split(",")[0].strip()

    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code="performance_report",
        language=guardian.preferred_language,
        variables={"student_name": student.name, "results": results_summary},
        recipient_type="guardian",
        recipient_id=guardian.id,
        phone_number=phone,
    )


@router.post("/send-credentials", response_model=WhatsAppLinkResponse)
async def send_credentials(
    payload: SendCredentialsRequest,
    current_user: User = Depends(require_permission("students.send_credentials")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppLinkResponse:
    if payload.subject_type == "teacher":
        profile = await session.get(TeacherProfile, payload.subject_id)
        if profile is None or profile.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        user = await session.get(User, profile.user_id)
        phone = profile.whatsapp_number
        language = "ur"
        recipient_type = "teacher"
        recipient_id = profile.id
    else:
        student = await session.get(StudentProfile, payload.subject_id)
        if student is None or student.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Student profile not found")
        user = await session.get(User, student.user_id)
        guardian = await _primary_guardian(session, student.id)
        phone = guardian.phone_numbers.split(",")[0].strip()
        language = guardian.preferred_language
        recipient_type = "guardian"
        recipient_id = guardian.id

    if user is None:
        raise HTTPException(status_code=404, detail="Linked user account not found")

    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code="credentials",
        language=language,
        variables={"username": user.username, "url": payload.set_password_url},
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        phone_number=phone,
    )


@router.get("/templates", response_model=list[MessageTemplateRead])
async def list_templates(
    current_user: User = Depends(require_permission("messaging.templates.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[MessageTemplate]:
    return (
        await session.execute(select(MessageTemplate).where(MessageTemplate.madrasa_id == madrasa.id))
    ).scalars().all()


@router.post("/templates", response_model=MessageTemplateRead)
async def create_template(
    payload: MessageTemplateCreate,
    current_user: User = Depends(require_permission("messaging.templates.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> MessageTemplate:
    existing = (
        await session.execute(select(MessageTemplate).where(MessageTemplate.code == payload.code))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Template code already exists")

    template = MessageTemplate(
        madrasa_id=madrasa.id, code=payload.code, name=payload.name, content=payload.content
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template
