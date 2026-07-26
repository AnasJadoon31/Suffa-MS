from uuid import UUID
from typing import Literal

from pydantic import BaseModel, Field

from app.core.phone import PakistanPhone


class WhatsAppLinkRequest(BaseModel):
    template_code: str
    recipient_type: str = Field(pattern="^(student|teacher|guardian)$")
    recipient_id: UUID
    phone_number: PakistanPhone
    language: str = "ur"
    variables: dict[str, str] = {}


class WhatsAppLinkResponse(BaseModel):
    normalised_number: str
    url: str = ""
    direct_sent: bool = False


WhatsAppConnectionState = Literal["open", "close", "connecting", "refused", "not_created", "unknown"]


class WhatsAppConnectionStatus(BaseModel):
    instance_name: str
    state: WhatsAppConnectionState
    connected: bool


class WhatsAppPairingRequest(BaseModel):
    phone_number: str
    replace_existing: bool = False


class WhatsAppPairingResponse(BaseModel):
    instance_name: str
    state: WhatsAppConnectionState
    pairing_code: str


class WhatsAppQrResponse(BaseModel):
    instance_name: str
    state: WhatsAppConnectionState
    qr_code_base64: str


class SendReportRequest(BaseModel):
    student_id: UUID
    result_link: str | None = None  # tap-through URL to the full result card (FR/Appendix C {result_link})


class SendCredentialsRequest(BaseModel):
    subject_type: str = Field(pattern="^(student|teacher|guardian)$")
    subject_id: UUID  # student_profiles.id, teacher_profiles.id, or guardians.id
    set_password_url: str
    phone_number: PakistanPhone | None = None


class MessageTemplateCreate(BaseModel):
    code: str
    name: str
    content: dict[str, str]  # {"en": "...", "ur": "..."}


class MessageTemplateRead(BaseModel):
    id: UUID
    code: str
    name: str
    content: dict[str, str]

    model_config = {"from_attributes": True}
