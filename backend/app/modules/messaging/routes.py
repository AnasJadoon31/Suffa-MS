import base64
from datetime import UTC, datetime
import logging
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
    WhatsAppConnectionStatus,
    WhatsAppLinkRequest,
    WhatsAppLinkResponse,
    WhatsAppPairingRequest,
    WhatsAppPairingResponse,
)
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile, TeacherProfile

router = APIRouter()
logger = logging.getLogger(__name__)


def _evolution_error_message(response: httpx.Response) -> str:
    """Extract Evolution v2's useful nested error without exposing request data."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:500]

    candidate = body.get("response", {}).get("message") if isinstance(body, dict) else None
    if isinstance(candidate, list):
        return "; ".join(str(item) for item in candidate)[:500]
    if candidate:
        return str(candidate)[:500]
    if isinstance(body, dict):
        return str(body.get("message") or body.get("error") or body)[:500]
    return str(body)[:500]


def _evolution_config() -> tuple[str, str, str]:
    if not (settings.evolution_api_url and settings.evolution_api_key and settings.evolution_instance):
        raise HTTPException(status_code=503, detail=ErrorCode.WHATSAPP_DELIVERY_NOT_CONFIGURED)
    return (
        settings.evolution_api_url.rstrip("/"),
        settings.evolution_api_key,
        quote(settings.evolution_instance, safe=""),
    )


def _require_evolution_tenant(madrasa: Madrasa) -> None:
    configured_tenant = settings.evolution_tenant_slug or settings.default_tenant
    if madrasa.slug != configured_tenant:
        raise HTTPException(status_code=403, detail=ErrorCode.PERMISSION_REQUIRED)


def _evolution_state(response: httpx.Response) -> str:
    body = response.json()
    instance_body = body.get("instance", body) if isinstance(body, dict) else {}
    state = str(instance_body.get("state") or instance_body.get("status") or "unknown").lower()
    return state if state in {"open", "close", "connecting", "refused"} else "unknown"


def _pairing_code_value(response: httpx.Response) -> str | None:
    body = response.json()
    qrcode = body.get("qrcode", body) if isinstance(body, dict) else {}
    raw_code = str(qrcode.get("pairingCode") or "").replace("-", "")
    return (f"{raw_code[:4]}-{raw_code[4:]}" if len(raw_code) > 4 else raw_code) or None


def _pairing_code(response: httpx.Response) -> str:
    pairing_code = _pairing_code_value(response)
    if pairing_code is None:
        logger.warning("Evolution returned phone-pairing data without a pairing code")
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED)
    return pairing_code


def _webhook_payload(body: object) -> dict[str, object] | None:
    if not isinstance(body, dict) or not body.get("url"):
        return None
    return {
        "webhook": {
            "enabled": body.get("enabled", True),
            "url": body["url"],
            "headers": body.get("headers") or {},
            "base64": body.get("webhookBase64", body.get("base64", False)),
            "byEvents": body.get("webhookByEvents", body.get("byEvents", False)),
            "events": body.get("events") or [],
        }
    }


def _raise_evolution_pairing_failure(response: httpx.Response) -> None:
    logger.warning(
        "Evolution phone pairing failed status=%s error=%s",
        response.status_code,
        _evolution_error_message(response),
    )
    raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED)


@router.get("/whatsapp/connection", response_model=WhatsAppConnectionStatus)
async def whatsapp_connection_status(
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
) -> WhatsAppConnectionStatus:
    _require_evolution_tenant(madrasa)
    base_url, api_key, instance = _evolution_config()
    headers = {"apikey": api_key}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{base_url}/instance/connectionState/{instance}", headers=headers
            )
    except httpx.RequestError as exc:
        logger.warning("Evolution connection status request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    if response.status_code == 404:
        return WhatsAppConnectionStatus(
            instance_name=settings.evolution_instance, state="not_created", connected=False
        )
    if response.is_error:
        _raise_evolution_pairing_failure(response)
    state = _evolution_state(response)
    return WhatsAppConnectionStatus(
        instance_name=settings.evolution_instance,
        state=state,
        connected=state == "open",
    )


@router.post("/whatsapp/connection/pairing-code", response_model=WhatsAppPairingResponse)
async def request_whatsapp_pairing_code(
    payload: WhatsAppPairingRequest,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
) -> WhatsAppPairingResponse:
    _require_evolution_tenant(madrasa)
    phone_number = "".join(character for character in payload.phone_number if character.isdigit())
    if not 8 <= len(phone_number) <= 15:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID)
    base_url, api_key, instance = _evolution_config()
    headers = {"apikey": api_key, "Content-Type": "application/json"}
    pairing_response: httpx.Response
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            state_response = await client.get(
                f"{base_url}/instance/connectionState/{instance}", headers=headers
            )
            if state_response.status_code != 404:
                if state_response.is_error:
                    _raise_evolution_pairing_failure(state_response)
                state = _evolution_state(state_response)
                if state == "open":
                    raise HTTPException(
                        status_code=409, detail=ErrorCode.WHATSAPP_INSTANCE_ALREADY_CONNECTED
                    )
                if state in {"close", "connecting"}:
                    pairing_response = await client.get(
                        f"{base_url}/instance/connect/{instance}",
                        headers=headers,
                        params={"number": phone_number},
                    )
                    if pairing_response.is_error:
                        _raise_evolution_pairing_failure(pairing_response)
                    existing_code = _pairing_code_value(pairing_response)
                    if existing_code is not None:
                        return WhatsAppPairingResponse(
                            instance_name=settings.evolution_instance,
                            state="connecting",
                            pairing_code=existing_code,
                        )
                    if state == "close":
                        raise HTTPException(
                            status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED
                        )
                    if not payload.replace_existing:
                        raise HTTPException(
                            status_code=428,
                            detail=ErrorCode.WHATSAPP_PAIRING_REPLACE_REQUIRED,
                        )

                if state not in {"connecting", "refused"}:
                    logger.warning("Evolution instance cannot enter phone pairing state=%s", state)
                    raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED)

                webhook_response = await client.get(
                    f"{base_url}/webhook/find/{instance}", headers=headers
                )
                if webhook_response.is_error and webhook_response.status_code != 404:
                    _raise_evolution_pairing_failure(webhook_response)
                try:
                    webhook_body = webhook_response.json()
                except ValueError:
                    webhook_body = None
                saved_webhook = (
                    _webhook_payload(webhook_body) if not webhook_response.is_error else None
                )
                delete_response = await client.delete(f"{base_url}/instance/delete/{instance}", headers=headers)
                if delete_response.is_error and delete_response.status_code != 404:
                    _raise_evolution_pairing_failure(delete_response)
            else:
                saved_webhook = None

            pairing_response = await client.post(
                f"{base_url}/instance/create", headers=headers,
                json={"instanceName": settings.evolution_instance, "integration": "WHATSAPP-BAILEYS", "qrcode": True, "number": phone_number},
            )
            if pairing_response.is_error:
                _raise_evolution_pairing_failure(pairing_response)
            if saved_webhook is not None:
                webhook_set_response = await client.post(
                    f"{base_url}/webhook/set/{instance}", headers=headers, json=saved_webhook
                )
                if webhook_set_response.is_error:
                    _raise_evolution_pairing_failure(webhook_set_response)
    except httpx.RequestError as exc:
        logger.warning("Evolution phone pairing request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    return WhatsAppPairingResponse(
        instance_name=settings.evolution_instance,
        state="connecting",
        pairing_code=_pairing_code(pairing_response),
    )


async def _require_open_evolution_instance(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    instance = quote(settings.evolution_instance, safe="")
    endpoint = f"{settings.evolution_api_url.rstrip('/')}/instance/connectionState/{instance}"
    try:
        response = await client.get(endpoint, headers=headers)
    except httpx.RequestError as exc:
        logger.warning("Evolution connection-state request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_MEDIA_DELIVERY_FAILED) from exc

    if response.is_error:
        logger.warning(
            "Evolution instance check failed status=%s error=%s",
            response.status_code,
            _evolution_error_message(response),
        )
        detail = (
            ErrorCode.WHATSAPP_INSTANCE_UNAVAILABLE
            if response.status_code == 404
            else ErrorCode.WHATSAPP_MEDIA_DELIVERY_FAILED
        )
        raise HTTPException(status_code=503 if response.status_code == 404 else 502, detail=detail)

    state = _evolution_state(response)
    if state != "open":
        logger.warning("Evolution instance is unavailable state=%s", state or "unknown")
        raise HTTPException(status_code=503, detail=ErrorCode.WHATSAPP_INSTANCE_UNAVAILABLE)


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
        _require_evolution_tenant(madrasa)
        if not (settings.evolution_api_url and settings.evolution_api_key and settings.evolution_instance):
            raise HTTPException(status_code=503, detail=ErrorCode.WHATSAPP_DELIVERY_NOT_CONFIGURED)
        instance = quote(settings.evolution_instance, safe="")
        endpoint = f"{settings.evolution_api_url.rstrip('/')}/message/sendMedia/{instance}"
        payload = {
            "number": number,
            "mediatype": "document",
            "mimetype": "application/pdf",
            "media": base64.b64encode(attachment_bytes).decode("ascii"),
            "fileName": attachment_name,
            "caption": message,
        }
        headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await _require_open_evolution_instance(client, headers)
                response = await client.post(endpoint, headers=headers, json=payload)
        except httpx.RequestError as exc:
            logger.warning("Evolution media delivery request failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_MEDIA_DELIVERY_FAILED) from exc
        if response.is_error:
            logger.warning(
                "Evolution media delivery failed status=%s error=%s",
                response.status_code,
                _evolution_error_message(response),
            )
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
