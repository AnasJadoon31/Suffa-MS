from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MadrasaCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")
    content_language: str = Field(default="ur", min_length=2, max_length=8)
    principal_username: str = Field(min_length=3, max_length=80)
    # Features to disable at onboarding; everything else starts enabled.
    disabled_features: list[str] = []


class MadrasaCreateResponse(BaseModel):
    madrasa_id: UUID
    slug: str
    principal_user_id: UUID
    set_password_url: str


class PlatformMadrasaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    name: str
    content_language: str
    created_at: datetime


class FeatureFlagRead(BaseModel):
    key: str
    label: str
    enabled: bool


class FeatureFlagsUpdate(BaseModel):
    # Partial update: only the keys present are changed.
    features: dict[str, bool]
