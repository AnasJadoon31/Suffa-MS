from uuid import UUID

from pydantic import BaseModel, Field


class WhatsAppLinkRequest(BaseModel):
    template_code: str
    recipient_type: str = Field(pattern="^(student|teacher|guardian)$")
    recipient_id: UUID
    phone_number: str
    language: str = "ur"
    variables: dict[str, str] = {}


class WhatsAppLinkResponse(BaseModel):
    normalised_number: str
    url: str


class SendReportRequest(BaseModel):
    student_id: UUID
    result_link: str | None = None  # tap-through URL to the full result card (FR/Appendix C {result_link})


class SendCredentialsRequest(BaseModel):
    subject_type: str = Field(pattern="^(student|teacher)$")
    subject_id: UUID  # student_profiles.id or teacher_profiles.id
    set_password_url: str


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
