from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import registry
from app.core.security import issue_token, verify_password
from app.core.tenancy import TenantContext, get_tenant
from app.core.dependencies import get_current_user, get_current_madrasa
from app.db.base import get_session
from app.modules.auth.models import User, UserStatus
from app.modules.academics.models import Madrasa
from app.modules.auth.schemas import (
    LoginRequest,
    PermissionGrantRequest,
    ProvisionUserRequest,
    ProvisionUserResponse,
    TokenResponse,
    CurrentUserResponse,
    UserRead,
    MadrasaRead
)

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
async def login(
    payload: LoginRequest, 
    tenant: TenantContext = Depends(get_tenant),
    session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    stmt = select(User).where(User.username == payload.username, User.status == UserStatus.active)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = issue_token(str(user.id), extra={"tenant": tenant.slug, "role": str(user.role)})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> CurrentUserResponse:
    # Fetch permissions from DB or role later
    permissions = []
    
    return CurrentUserResponse(
        user=UserRead.model_validate(current_user),
        madrasa=MadrasaRead.model_validate(madrasa),
        permissions=permissions
    )


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
