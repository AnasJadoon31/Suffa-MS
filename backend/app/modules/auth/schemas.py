from enum import StrEnum
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class Role(StrEnum):
    principal = "principal"
    teacher = "teacher"
    student = "student"
    parent = "parent"


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    role: str
    status: str
    preferred_language: str
    created_at: datetime


class MadrasaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    name: str
    created_at: datetime


class CurrentUserResponse(BaseModel):
    user: UserRead
    madrasa: MadrasaRead | None = None
    permissions: list[str] = []


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
