import base64
from datetime import UTC, datetime
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, require_permission
from app.core.config import settings
from app.core.error_codes import ErrorCode
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.db.session import get_session
from app.modules.academics.models import AcademicClass, AcademicSession, Course, Enrollment, Madrasa
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
    attachment_bytes: bytes | None = None,
    attachment_name: str = "report.pdf",
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

    result = WhatsAppLinkResponse(normalised_number=number, url=f"https://wa.me/{number}?text={quote(message)}")
    if attachment_bytes is not None:
        if not (settings.evolution_api_url and settings.evolution_api_key and settings.evolution_instance):
            raise HTTPException(status_code=503, detail=ErrorCode.WHATSAPP_DELIVERY_NOT_CONFIGURED)
        endpoint = f"{settings.evolution_api_url.rstrip('/')}/message/sendMedia/{settings.evolution_instance}"
        payload = {
            "number": number,
            "mediatype": "document",
            "mimetype": "application/pdf",
            "media": base64.b64encode(attachment_bytes).decode("ascii"),
            "fileName": attachment_name,
            "caption": message,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                endpoint,
                headers={"apikey": settings.evolution_api_key, "Content-Type": "application/json"},
                json=payload,
            )
        if response.is_error:
            raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_MEDIA_DELIVERY_FAILED)
        result = WhatsAppLinkResponse(normalised_number=number, direct_sent=True)

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
    return result


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

    class_name = "—"
    session_name = "—"
    enrollment = (
        await session.execute(
            select(Enrollment)
            .where(Enrollment.student_id == student.id, Enrollment.session_id == publication.session_id)
            .order_by(Enrollment.created_at.desc())
        )
    ).scalars().first()
    if enrollment is not None:
        academic_class = await session.get(AcademicClass, enrollment.class_id)
        class_name = academic_class.name if academic_class else class_name
    academic_session = await session.get(AcademicSession, publication.session_id)
    if academic_session is not None:
        session_name = academic_session.name

    guardian = await _primary_guardian(session, student.id)
    phone = guardian.phone_numbers.split(",")[0].strip()

    from app.modules.assessments.routes import _render_result_card

    report_pdf = await _render_result_card(session, madrasa.id, student, publication.session_id)
    return await render_and_dispatch(
        session,
        madrasa=madrasa,
        current_user=current_user,
        template_code="performance_report",
        language=guardian.preferred_language,
        variables={
            "guardian_name": guardian.name,
            "student_name": student.name,
            "class_name": class_name,
            "session": session_name,
            "summary_line": results_summary,
            "result_link": payload.result_link or "(available on the student portal)",
            "madrasa_name": madrasa.name,
            # legacy key kept so templates seeded before Appendix C alignment still render
            "results": results_summary,
        },
        recipient_type="guardian",
        recipient_id=guardian.id,
        phone_number=phone,
        attachment_bytes=report_pdf,
        attachment_name=f"result-{student.admission_number}.pdf",
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
        subject_name = profile.name
        phone = profile.whatsapp_number
        language = "ur"
        recipient_type = "teacher"
        recipient_id = profile.id
    else:
        student = await session.get(StudentProfile, payload.subject_id)
        if student is None or student.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Student profile not found")
        user = await session.get(User, student.user_id)
        subject_name = student.name
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
        variables={
            "student_name": subject_name,
            "username": user.username,
            "setup_link": payload.set_password_url,
            "madrasa_name": madrasa.name,
            # legacy key kept so templates seeded before Appendix C alignment still render
            "url": payload.set_password_url,
        },
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        phone_number=phone,
    )


@router.get("/templates", response_model=list[MessageTemplateRead])
async def list_templates(
    response: Response,
    current_user: User = Depends(require_permission("messaging.templates.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[MessageTemplateRead]:
    stmt = select(MessageTemplate).where(MessageTemplate.madrasa_id == madrasa.id)
    rows = await paginate_scalars(
        session, stmt.order_by(MessageTemplate.name), limit=limit, offset=offset, response=response
    )
    return [MessageTemplateRead.model_validate(row) for row in rows]


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
