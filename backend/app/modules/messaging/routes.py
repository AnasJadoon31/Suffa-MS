from urllib.parse import quote

from fastapi import APIRouter, Depends

from app.core.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.messaging.schemas import WhatsAppLinkRequest, WhatsAppLinkResponse

router = APIRouter()


def normalise_phone_number(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if digits.startswith("0"):
        return "92" + digits[1:]
    if len(digits) == 10 and digits.startswith("3"):
        return "92" + digits
    return digits


def render_template(template: str, variables: dict[str, str]) -> str:
    message = template
    for key, value in variables.items():
        message = message.replace("{" + key + "}", value)
    return message


@router.post("/whatsapp-link", response_model=WhatsAppLinkResponse)
async def whatsapp_link(
    payload: WhatsAppLinkRequest,
    current_user: User = Depends(require_permission("messaging.send")),
) -> WhatsAppLinkResponse:
    number = normalise_phone_number(payload.phone_number)
    message = render_template(payload.template, payload.variables)
    return WhatsAppLinkResponse(normalised_number=number, url=f"https://wa.me/{number}?text={quote(message)}")
