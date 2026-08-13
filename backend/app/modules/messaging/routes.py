import base64
from dataclasses import dataclass
from datetime import UTC, datetime
import logging
import re
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, require_permission
from app.core.config import settings
from app.core.phone import evolution_number, normalize_pakistan_phone
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
    WhatsAppQrResponse,
)
from app.modules.finance.models import Donor
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile, TeacherProfile

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_EVOLUTION_WEBHOOK_EVENTS = [
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
]


@dataclass(frozen=True)
class EvolutionConfig:
    base_url: str
    api_key: str
    instance_name: str
    instance_path: str
    webhook_url: str = ""
    webhook_base64: bool = True
    webhook_events: list[str] | None = None


def _evolution_error_message(response: httpx.Response) -> str:
    """Extract Evolution v2's useful nested error without exposing request data."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:500]

    def flatten(value: object) -> list[str]:
        if isinstance(value, list):
            flattened: list[str] = []
            for item in value:
                flattened.extend(flatten(item))
            return flattened
        return [str(value)]

    candidate = body.get("response", {}).get("message") if isinstance(body, dict) else None
    if isinstance(candidate, list):
        return "; ".join(flatten(candidate))[:500]
    if candidate:
        return str(candidate)[:500]
    if isinstance(body, dict):
        return str(body.get("message") or body.get("error") or body)[:500]
    return str(body)[:500]


def _redact_setup_links(message: str) -> str:
    """Do not persist account setup URLs/tokens in message logs."""
    return re.sub(r"(?:https?://\S+)?/set-password\?token=[^\s]+", "[setup-link-redacted]", message)


def _split_evolution_events(value: str) -> list[str]:
    events = [item.strip().upper() for item in value.split(",") if item.strip()]
    return events or DEFAULT_EVOLUTION_WEBHOOK_EVENTS


async def _evolution_config(session: AsyncSession, madrasa: Madrasa) -> EvolutionConfig:
    base_url = settings.evolution_api_url.strip().rstrip("/")
    api_key = settings.evolution_api_key.strip()
    instance_name = madrasa.slug
    webhook_url = settings.evolution_webhook_url.strip()
    webhook_base64 = settings.evolution_webhook_base64
    webhook_events = _split_evolution_events(settings.evolution_webhook_events)
    if not (base_url and api_key):
        raise HTTPException(status_code=503, detail=ErrorCode.WHATSAPP_DELIVERY_NOT_CONFIGURED)
    return EvolutionConfig(
        base_url=base_url,
        api_key=api_key,
        instance_name=instance_name,
        instance_path=quote(instance_name, safe=""),
        webhook_url=webhook_url,
        webhook_base64=webhook_base64,
        webhook_events=webhook_events,
    )


def _evolution_state(response: httpx.Response) -> str:
    body = response.json()
    instance_body = body.get("instance", body) if isinstance(body, dict) else {}
    state = str(instance_body.get("state") or instance_body.get("status") or "unknown").lower()
    return state if state in {"open", "close", "connecting", "refused"} else "unknown"


def _evolution_owner_jid(response: httpx.Response) -> str | None:
    body = response.json()
    instance_body = body.get("instance", body) if isinstance(body, dict) else {}
    if not isinstance(instance_body, dict):
        return None
    owner_jid = instance_body.get("ownerJid") or instance_body.get("owner")
    return str(owner_jid) if owner_jid else None


def _owner_phone_number(owner_jid: str | None) -> str | None:
    if not owner_jid:
        return None
    number = owner_jid.split("@", 1)[0]
    if not number.isdigit() or len(number) < 8:
        return None
    return f"+{number}"


def _matching_instance(body: object, instance_name: str) -> dict[str, object] | None:
    candidates: object
    if isinstance(body, list):
        candidates = body
    elif isinstance(body, dict):
        candidates = body.get("instances") or body.get("instance") or body.get("data") or []
    else:
        candidates = []

    if isinstance(candidates, dict):
        candidates = [candidates]
    if not isinstance(candidates, list):
        return None

    for item in candidates:
        if not isinstance(item, dict):
            continue
        instance = item.get("instance")
        instance_body = instance if isinstance(instance, dict) else item
        name = instance_body.get("instanceName") or instance_body.get("instance_name") or instance_body.get("name")
        if str(name) == instance_name:
            return instance_body
    return None


async def _fetch_evolution_owner(
    client: httpx.AsyncClient, headers: dict[str, str], config: EvolutionConfig
) -> tuple[str | None, str | None]:
    response = await client.get(f"{config.base_url}/instance/fetchInstances", headers=headers)
    if response.is_error:
        logger.warning(
            "Evolution fetchInstances failed status=%s error=%s",
            response.status_code,
            _evolution_error_message(response),
        )
        return None, None
    try:
        instance = _matching_instance(response.json(), config.instance_name)
    except ValueError:
        return None, None
    owner_jid = str(instance.get("ownerJid") or instance.get("owner") or "") if instance else ""
    owner_jid = owner_jid or None
    return owner_jid, _owner_phone_number(owner_jid)


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


def _qr_code_base64_value(response: httpx.Response) -> str | None:
    body = response.json()
    qrcode = body.get("qrcode", body) if isinstance(body, dict) else {}
    raw_qr = qrcode.get("base64") or qrcode.get("code")
    return str(raw_qr) if raw_qr else None


def _qr_code_base64(response: httpx.Response) -> str:
    qr_code = _qr_code_base64_value(response)
    if qr_code is None:
        logger.warning("Evolution returned QR pairing data without a QR code")
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED)
    return qr_code


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


def _configured_webhook_payload(config: EvolutionConfig) -> dict[str, object] | None:
    if not config.webhook_url:
        return None
    return {
        "webhook": {
            "enabled": True,
            "url": config.webhook_url,
            "headers": {},
            "base64": config.webhook_base64,
            "byEvents": False,
            "events": config.webhook_events or DEFAULT_EVOLUTION_WEBHOOK_EVENTS,
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
    session: AsyncSession = Depends(get_session),
) -> WhatsAppConnectionStatus:
    config = await _evolution_config(session, madrasa)
    headers = {"apikey": config.api_key}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{config.base_url}/instance/connectionState/{config.instance_path}", headers=headers
            )
            owner_jid: str | None = None
            owner_phone_number: str | None = None
            if not response.is_error:
                state = _evolution_state(response)
                owner_jid = _evolution_owner_jid(response)
                owner_phone_number = _owner_phone_number(owner_jid)
                if state == "open" and owner_jid is None:
                    owner_jid, owner_phone_number = await _fetch_evolution_owner(client, headers, config)
    except httpx.RequestError as exc:
        logger.warning("Evolution connection status request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    if response.status_code == 404:
        return WhatsAppConnectionStatus(
            instance_name=config.instance_name, state="not_created", connected=False
        )
    if response.is_error:
        _raise_evolution_pairing_failure(response)
    return WhatsAppConnectionStatus(
        instance_name=config.instance_name,
        state=state,
        connected=state == "open",
        connected_jid=owner_jid,
        connected_phone_number=owner_phone_number,
    )


@router.delete("/whatsapp/connection", response_model=WhatsAppConnectionStatus)
async def disconnect_whatsapp_connection(
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppConnectionStatus:
    config = await _evolution_config(session, madrasa)
    headers = {"apikey": config.api_key}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.delete(
                f"{config.base_url}/instance/delete/{config.instance_path}", headers=headers
            )
    except httpx.RequestError as exc:
        logger.warning("Evolution disconnect request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    if response.is_error and response.status_code != 404:
        _raise_evolution_pairing_failure(response)
    return WhatsAppConnectionStatus(
        instance_name=config.instance_name,
        state="not_created",
        connected=False,
        connected_jid=None,
        connected_phone_number=None,
    )


@router.post("/whatsapp/connection/qr-code", response_model=WhatsAppQrResponse)
async def request_whatsapp_qr_code(
    replace_existing: bool = False,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppQrResponse:
    config = await _evolution_config(session, madrasa)
    headers = {"apikey": config.api_key, "Content-Type": "application/json"}
    qr_response: httpx.Response
    saved_webhook = _configured_webhook_payload(config)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            state_response = await client.get(
                f"{config.base_url}/instance/connectionState/{config.instance_path}", headers=headers
            )
            if state_response.status_code != 404:
                if state_response.is_error:
                    _raise_evolution_pairing_failure(state_response)
                state = _evolution_state(state_response)
                if state == "open":
                    raise HTTPException(
                        status_code=409, detail=ErrorCode.WHATSAPP_INSTANCE_ALREADY_CONNECTED
                    )
                if state in {"close", "connecting", "refused"}:
                    qr_response = await client.get(
                        f"{config.base_url}/instance/connect/{config.instance_path}", headers=headers
                    )
                    if qr_response.is_error:
                        _raise_evolution_pairing_failure(qr_response)
                    existing_qr = _qr_code_base64_value(qr_response)
                    if existing_qr is not None and not replace_existing:
                        return WhatsAppQrResponse(
                            instance_name=config.instance_name,
                            state="connecting",
                            qr_code_base64=existing_qr,
                        )
                    if not replace_existing:
                        raise HTTPException(
                            status_code=428,
                            detail=ErrorCode.WHATSAPP_PAIRING_REPLACE_REQUIRED,
                        )

                webhook_response = await client.get(
                    f"{config.base_url}/webhook/find/{config.instance_path}", headers=headers
                )
                if webhook_response.is_error and webhook_response.status_code != 404:
                    _raise_evolution_pairing_failure(webhook_response)
                try:
                    webhook_body = webhook_response.json()
                except ValueError:
                    webhook_body = None
                saved_webhook = saved_webhook or (
                    _webhook_payload(webhook_body) if not webhook_response.is_error else None
                )
                delete_response = await client.delete(
                    f"{config.base_url}/instance/delete/{config.instance_path}", headers=headers
                )
                if delete_response.is_error and delete_response.status_code != 404:
                    _raise_evolution_pairing_failure(delete_response)

            qr_response = await client.post(
                f"{config.base_url}/instance/create",
                headers=headers,
                json={
                    "instanceName": config.instance_name,
                    "integration": "WHATSAPP-BAILEYS",
                    "qrcode": True,
                },
            )
            if qr_response.is_error:
                _raise_evolution_pairing_failure(qr_response)
            if saved_webhook is not None:
                webhook_set_response = await client.post(
                    f"{config.base_url}/webhook/set/{config.instance_path}", headers=headers, json=saved_webhook
                )
                if webhook_set_response.is_error:
                    _raise_evolution_pairing_failure(webhook_set_response)
    except httpx.RequestError as exc:
        logger.warning("Evolution QR pairing request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    return WhatsAppQrResponse(
        instance_name=config.instance_name,
        state="connecting",
        qr_code_base64=_qr_code_base64(qr_response),
    )


@router.post("/whatsapp/connection/pairing-code", response_model=WhatsAppPairingResponse)
async def request_whatsapp_pairing_code(
    payload: WhatsAppPairingRequest,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> WhatsAppPairingResponse:
    config = await _evolution_config(session, madrasa)
    try:
        phone_number = evolution_number(payload.phone_number)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID)
    headers = {"apikey": config.api_key, "Content-Type": "application/json"}
    pairing_response: httpx.Response
    saved_webhook = _configured_webhook_payload(config)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            state_response = await client.get(
                f"{config.base_url}/instance/connectionState/{config.instance_path}", headers=headers
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
                        f"{config.base_url}/instance/connect/{config.instance_path}",
                        headers=headers,
                        params={"number": phone_number},
                    )
                    if pairing_response.is_error:
                        _raise_evolution_pairing_failure(pairing_response)
                    existing_code = _pairing_code_value(pairing_response)
                    if existing_code is not None and not payload.replace_existing:
                        return WhatsAppPairingResponse(
                            instance_name=config.instance_name,
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
                    f"{config.base_url}/webhook/find/{config.instance_path}", headers=headers
                )
                if webhook_response.is_error and webhook_response.status_code != 404:
                    _raise_evolution_pairing_failure(webhook_response)
                try:
                    webhook_body = webhook_response.json()
                except ValueError:
                    webhook_body = None
                saved_webhook = saved_webhook or (
                    _webhook_payload(webhook_body) if not webhook_response.is_error else None
                )
                delete_response = await client.delete(f"{config.base_url}/instance/delete/{config.instance_path}", headers=headers)
                if delete_response.is_error and delete_response.status_code != 404:
                    _raise_evolution_pairing_failure(delete_response)
            pairing_response = await client.post(
                f"{config.base_url}/instance/create", headers=headers,
                json={"instanceName": config.instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True, "number": phone_number},
            )
            if pairing_response.is_error:
                _raise_evolution_pairing_failure(pairing_response)
            if saved_webhook is not None:
                webhook_set_response = await client.post(
                    f"{config.base_url}/webhook/set/{config.instance_path}", headers=headers, json=saved_webhook
                )
                if webhook_set_response.is_error:
                    _raise_evolution_pairing_failure(webhook_set_response)
    except httpx.RequestError as exc:
        logger.warning("Evolution phone pairing request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_PAIRING_CODE_FAILED) from exc

    return WhatsAppPairingResponse(
        instance_name=config.instance_name,
        state="connecting",
        pairing_code=_pairing_code(pairing_response),
    )


async def _require_open_evolution_instance(
    client: httpx.AsyncClient, headers: dict[str, str], config: EvolutionConfig
) -> None:
    endpoint = f"{config.base_url}/instance/connectionState/{config.instance_path}"
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
    return evolution_number(value)


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
    force_direct_text: bool = False,
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
    if attachment_bytes is None and force_direct_text:
        config = await _evolution_config(session, madrasa)
        endpoint = f"{config.base_url}/message/sendText/{config.instance_path}"
        payload = {"number": number, "text": message}
        headers = {"apikey": config.api_key, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await _require_open_evolution_instance(client, headers, config)
                response = await client.post(endpoint, headers=headers, json=payload)
        except httpx.RequestError as exc:
            logger.warning("Evolution text delivery request failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_TEXT_DELIVERY_FAILED) from exc
        if response.is_error:
            logger.warning(
                "Evolution text delivery failed status=%s error=%s",
                response.status_code,
                _evolution_error_message(response),
            )
            raise HTTPException(status_code=502, detail=ErrorCode.WHATSAPP_TEXT_DELIVERY_FAILED)
        result = WhatsAppLinkResponse(normalised_number=number, direct_sent=True)

    if attachment_bytes is not None:
        config = await _evolution_config(session, madrasa)
        endpoint = f"{config.base_url}/message/sendMedia/{config.instance_path}"
        payload = {
            "number": number,
            "mediatype": "document",
            "mimetype": "application/pdf",
            "media": base64.b64encode(attachment_bytes).decode("ascii"),
            "fileName": attachment_name,
            "caption": message,
        }
        headers = {"apikey": config.api_key, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await _require_open_evolution_instance(client, headers, config)
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
            content_sent=_redact_setup_links(message),
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


async def _student_credentials_recipient(
    session: AsyncSession,
    student: StudentProfile,
    requested_number: str | None = None,
) -> tuple[str, str, UUID, str]:
    candidates: list[tuple[str, str, UUID, str]] = []
    if student.is_independent and (student.default_phone_number or student.phone):
        candidates.append((student.default_phone_number or student.phone, "student", student.id, "ur"))

    guardians = (
        await session.execute(
            select(Guardian)
            .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
            .where(StudentGuardian.student_id == student.id)
        )
    ).scalars().all()
    for guardian in guardians:
        for phone in guardian.phone_list or [part.strip() for part in guardian.phone_numbers.replace(";", ",").split(",") if part.strip()]:
            candidates.append((phone, "guardian", guardian.id, guardian.preferred_language))

    if not candidates and not student.is_independent:
        raise HTTPException(status_code=404, detail="Dependent student has no guardian on file to message")
    if not candidates:
        raise HTTPException(status_code=404, detail="Student has no phone or guardian on file to message")

    try:
        normalised = [
            (normalize_pakistan_phone(phone), recipient_type, recipient_id, language)
            for phone, recipient_type, recipient_id, language in candidates
        ]
        requested = normalize_pakistan_phone(requested_number) if requested_number else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID) from exc

    if requested is None:
        preferred_type = "student" if student.is_independent else "guardian"
        for candidate in normalised:
            if candidate[1] == preferred_type:
                return candidate
        return normalised[0]

    for candidate in normalised:
        if candidate[0] == requested:
            return candidate
    raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID)


def _recipient_phone(stored_numbers: str, requested_number: str | None = None) -> str:
    phones = [part.strip() for part in stored_numbers.replace(";", ",").split(",") if part.strip()]
    if not phones:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID)
    normalised = []
    try:
        normalised = [normalize_pakistan_phone(phone) for phone in phones]
        requested = normalize_pakistan_phone(requested_number) if requested_number else normalised[0]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID) from exc
    if requested not in normalised:
        raise HTTPException(status_code=422, detail=ErrorCode.WHATSAPP_PHONE_INVALID)
    return requested


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
    phone = guardian.default_phone_number or (guardian.phone_list or guardian.phone_numbers.split(","))[0].strip()

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
        phone = _recipient_phone(profile.default_phone_number or profile.whatsapp_number, payload.phone_number)
        language = "ur"
        recipient_type = "teacher"
        recipient_id = profile.id
    elif payload.subject_type == "student":
        student = await session.get(StudentProfile, payload.subject_id)
        if student is None or student.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Student profile not found")
        user = await session.get(User, student.user_id)
        subject_name = student.name
        phone, recipient_type, recipient_id, language = await _student_credentials_recipient(
            session, student, payload.phone_number
        )
    elif payload.subject_type == "donor":
        donor = await session.get(Donor, payload.subject_id)
        if donor is None or donor.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Donor not found")
        user = await session.get(User, donor.user_id)
        subject_name = donor.name
        phone = _recipient_phone(donor.default_phone_number or donor.contact, payload.phone_number)
        language = "ur"
        recipient_type = "donor"
        recipient_id = donor.id
    else:
        guardian = await session.get(Guardian, payload.subject_id)
        if guardian is None or guardian.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Guardian not found")
        user = await session.get(User, guardian.user_id)
        subject_name = guardian.name
        phone = _recipient_phone(guardian.default_phone_number or guardian.phone_numbers, payload.phone_number)
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
            "name": subject_name,
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
        force_direct_text=True,
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
