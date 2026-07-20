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
    selected_session_id: UUID | None = None
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
    # Per-madrasa feature flags (super-admin controlled); frontend hides
    # disabled modules, backend enforces via require_feature.
    features: dict[str, bool] = {}
    branding: dict[str, str] = {}


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


class UpdateMeRequest(BaseModel):
    preferred_language: str | None = Field(default=None, min_length=2, max_length=8)
    selected_session_id: UUID | None = None
    # selected_session_id=None means "leave unchanged"; set this flag to reset
    # the user back to following the madrasa's active session.
    clear_selected_session: bool = False


class ScopeType(StrEnum):
    class_ = "class"
    section = "section"


class PermissionGrant(BaseModel):
    code: str
    scope_type: ScopeType | None = None
    scope_id: UUID | None = None


class PermissionGrantRequest(BaseModel):
    user_id: UUID
    # Legacy flat form (madrasa-wide grants only)…
    permission_codes: list[str] = []
    # …or the scoped form. Both may be combined; the union is stored.
    grants: list[PermissionGrant] = []


class PermissionGrantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    permission_code: str
    scope_type: str | None = None
    scope_id: UUID | None = None
    granted_by_id: UUID
    created_at: datetime


class SetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
