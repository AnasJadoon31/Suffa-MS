from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.permissions import registry
from app.core.security import ALGORITHM, hash_password, verify_password, issue_token
from app.core.tenancy import TenantContext, get_tenant
from app.core.dependencies import get_current_user, get_current_madrasa, require_permission
from app.db.session import get_session
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.auth.service import UsernameTakenError, provision_login
from app.modules.academics.models import Madrasa
from app.modules.auth.schemas import (
    LoginRequest,
    PermissionGrantRequest,
    ProvisionUserRequest,
    ProvisionUserResponse,
    Role,
    SetPasswordRequest,
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
    if current_user.role == UserRole.principal:
        # Implicit superuser (FR-RBAC-01): holds every registered permission.
        permissions = [permission.code for permission in registry.all()]
    else:
        stmt = select(UserPermission.permission_code).where(UserPermission.user_id == current_user.id)
        result = await session.execute(stmt)
        permissions = sorted(result.scalars().all())

    return CurrentUserResponse(
        user=UserRead.model_validate(current_user),
        madrasa=MadrasaRead.model_validate(madrasa),
        permissions=permissions
    )


@router.post("/provision", response_model=ProvisionUserResponse)
async def provision_user(
    payload: ProvisionUserRequest,
    current_user: User = Depends(require_permission("students.provision")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ProvisionUserResponse:
    if payload.role == Role.parent:
        raise HTTPException(status_code=400, detail="Guardians do not have logins in v1")

    try:
        user, set_password_url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=payload.username,
            role=UserRole(payload.role.value),
            preferred_language=payload.preferred_language,
            portal_enabled=payload.portal_enabled,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.commit()

    return ProvisionUserResponse(
        user_id=user.id,
        username=user.username,
        set_password_url=set_password_url,
        expires_in_hours=settings.set_password_token_hours,
    )


@router.post("/set-password")
async def set_password(
    payload: SetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    try:
        token_payload = jwt.decode(payload.token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired link")

    if token_payload.get("purpose") != "set-password":
        raise HTTPException(status_code=400, detail="Invalid link")

    try:
        user_id = UUID(token_payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid link")

    user = await session.get(User, user_id)
    if user is None or user.status != UserStatus.invited:
        # Also blocks replaying an already-used link (FR-AUTH-03: one-time).
        raise HTTPException(status_code=400, detail="This link has already been used or is invalid")

    user.password_hash = hash_password(payload.password)
    user.status = UserStatus.active
    await session.commit()
    return {"status": "ok"}


@router.get("/permissions")
async def permissions(current_user: User = Depends(get_current_user)) -> list[dict[str, str | bool]]:
    return [permission.__dict__ for permission in registry.all()]


@router.put("/permissions/grants")
async def grant_permissions(
    payload: PermissionGrantRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    if current_user.role != UserRole.principal:
        raise HTTPException(status_code=403, detail="Only the Principal can grant permissions")

    try:
        for code in payload.permission_codes:
            registry.require_known(code)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = await session.get(User, payload.user_id)
    if target is None or target.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")

    existing_stmt = select(UserPermission).where(UserPermission.user_id == payload.user_id)
    existing = (await session.execute(existing_stmt)).scalars().all()
    old_codes = sorted(item.permission_code for item in existing)
    for item in existing:
        await session.delete(item)

    new_codes = sorted(set(payload.permission_codes))
    for code in new_codes:
        session.add(UserPermission(user_id=payload.user_id, permission_code=code, granted_by_id=current_user.id))

    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="permissions.grant",
        entity_name="user",
        entity_id=str(payload.user_id),
        old_values={"permission_codes": old_codes},
        new_values={"permission_codes": new_codes},
    )
    await session.commit()

    return {"user_id": payload.user_id, "permission_codes": new_codes, "audited": True}
