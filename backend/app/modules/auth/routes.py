from uuid import uuid4

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.permissions import registry
from app.core.security import issue_token
from app.core.tenancy import TenantContext, get_tenant
from app.modules.auth.schemas import (
    LoginRequest,
    PermissionGrantRequest,
    ProvisionUserRequest,
    ProvisionUserResponse,
    TokenResponse,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, tenant: TenantContext = Depends(get_tenant)) -> TokenResponse:
    token = issue_token(payload.username, extra={"tenant": tenant.slug})
    return TokenResponse(access_token=token)


@router.post("/provision", response_model=ProvisionUserResponse)
async def provision_user(payload: ProvisionUserRequest) -> ProvisionUserResponse:
    user_id = uuid4()
    token = issue_token(str(user_id), minutes=settings.set_password_token_hours * 60, extra={"purpose": "set-password"})
    return ProvisionUserResponse(
        user_id=user_id,
        username=payload.username,
        set_password_url=f"/set-password?token={token}",
        expires_in_hours=settings.set_password_token_hours,
    )


@router.get("/permissions")
async def permissions() -> list[dict[str, str | bool]]:
    return [permission.__dict__ for permission in registry.all()]


@router.put("/permissions/grants")
async def grant_permissions(payload: PermissionGrantRequest) -> dict[str, object]:
    for code in payload.permission_codes:
        registry.require_known(code)
    return {"user_id": payload.user_id, "permission_codes": payload.permission_codes, "audited": True}
