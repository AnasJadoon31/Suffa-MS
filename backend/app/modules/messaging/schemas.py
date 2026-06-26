from pydantic import BaseModel


class WhatsAppLinkRequest(BaseModel):
    phone_number: str
    template: str
    variables: dict[str, str] = {}


class WhatsAppLinkResponse(BaseModel):
    normalised_number: str
    url: str
