from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class Role(StrEnum):
    principal = "principal"
    teacher = "teacher"
    student = "student"


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProvisionUserRequest(BaseModel):
    username: str
    role: Role
    preferred_language: str = "en"
    portal_enabled: bool = True


class ProvisionUserResponse(BaseModel):
    user_id: UUID
    username: str
    set_password_url: str
    expires_in_hours: int


class PermissionGrantRequest(BaseModel):
    user_id: UUID
    permission_codes: list[str]
