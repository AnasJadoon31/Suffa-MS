from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.permissions import registry
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars, paginate_sequence
from app.core.rate_limit import LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_ATTEMPTS, assert_not_locked_out, clear_failures, record_failure
from app.core.security import ALGORITHM, hash_password, verify_password, issue_token
from app.core.settings_catalog import CATALOG_BY_KEY
from app.core.tenancy import TenantContext, get_tenant
from app.core.dependencies import (
    get_current_user,
    get_current_madrasa,
    get_enabled_features,
    require_permission,
    set_rls_context,
)
from app.db.session import get_session
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.auth.service import UsernameTakenError, provision_login
from app.modules.academics.models import AcademicClass, AcademicSession, Madrasa, Section
from app.modules.operations.models import MadrasaSetting
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PermissionGrant,
    PermissionGrantRead,
    PermissionGrantRequest,
    ProvisionUserRequest,
    ProvisionUserResponse,
    Role,
    SetPasswordRequest,
    TokenResponse,
    CurrentUserResponse,
    UpdateMeRequest,
    UserRead,
    MadrasaRead
)

router = APIRouter()

_DEFAULT_TOKEN_MINUTES = 30


async def _session_lifetime_minutes(session: AsyncSession, user: User) -> int:
    """Per-role idle-timeout setting (security.idle_timeout_minutes_<role> in
    the settings catalogue) becomes the access token's fixed lifetime — the
    simplest correct approximation of an idle timeout for a stateless JWT
    without adding refresh-token/session-tracking infra. Falls back to the
    catalogue default, then a hard 30-minute default for roles the catalogue
    doesn't define one for (parent, super_admin)."""
    key = f"security.idle_timeout_minutes_{user.role}"
    definition = CATALOG_BY_KEY.get(key)
    fallback = int(definition.default) if definition else _DEFAULT_TOKEN_MINUTES
    if user.madrasa_id is None:
        return fallback
    row = (
        await session.execute(
            select(MadrasaSetting).where(
                MadrasaSetting.madrasa_id == user.madrasa_id, MadrasaSetting.key == key
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return fallback
    try:
        return int(row.value)
    except ValueError:
        return fallback


@router.post("/token", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    tenant: TenantContext = Depends(get_tenant),
    session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    lockout_key = f"login_lockout:{tenant.slug}:{payload.username}"
    await assert_not_locked_out(lockout_key, LOGIN_MAX_ATTEMPTS)

    stmt = select(User).where(User.username == payload.username, User.status == UserStatus.active)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not await verify_password(payload.password, user.password_hash):
        await record_failure(lockout_key, LOGIN_LOCKOUT_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await set_rls_context(session, user)
    await clear_failures(lockout_key)
    minutes = await _session_lifetime_minutes(session, user)
    token = issue_token(str(user.id), minutes=minutes, extra={"tenant": tenant.slug, "role": str(user.role)})
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

    profile_rows = (
        await session.execute(
            select(MadrasaSetting.key, MadrasaSetting.value).where(
                MadrasaSetting.madrasa_id == madrasa.id,
                MadrasaSetting.key.in_([
                    "madrasa.address", "madrasa.phone", "madrasa.email",
                    "madrasa.website", "madrasa.logo_file_id",
                ]),
            )
        )
    ).all()

    return CurrentUserResponse(
        user=UserRead.model_validate(current_user),
        madrasa=MadrasaRead.model_validate(madrasa),
        permissions=permissions,
        features=await get_enabled_features(madrasa.id, session),
        branding={key: value for key, value in profile_rows},
    )


@router.patch("/me", response_model=CurrentUserResponse)
async def update_me(
    payload: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CurrentUserResponse:
    # Re-fetch within this request's session: get_current_user may hand back an
    # instance bound elsewhere, and mutations must be tracked here to persist.
    user = await session.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.preferred_language is not None:
        user.preferred_language = payload.preferred_language

    if payload.clear_selected_session:
        user.selected_session_id = None
    elif payload.selected_session_id is not None:
        academic_session = await session.get(AcademicSession, payload.selected_session_id)
        if academic_session is None or academic_session.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Academic session not found")
        user.selected_session_id = academic_session.id

    await session.commit()
    await session.refresh(user)
    return await get_me(current_user=user, madrasa=madrasa, session=session)


@router.post("/provision", response_model=ProvisionUserResponse)
async def provision_user(
    payload: ProvisionUserRequest,
    current_user: User = Depends(require_permission("students.provision")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ProvisionUserResponse:
    if payload.role == Role.parent:
        raise HTTPException(
            status_code=400,
            detail="Guardian logins are provisioned via POST /people/guardians/{id}/credentials-link",
        )

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

    user.password_hash = await hash_password(payload.password)
    user.status = UserStatus.active
    await session.commit()
    return {"status": "ok"}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    user = await session.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not await verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password_hash = await hash_password(payload.new_password)
    record_audit(
        session,
        madrasa_id=user.madrasa_id or madrasa.id,
        actor_id=user.id,
        action="auth.change_password",
        entity_name="user",
        entity_id=str(user.id),
        old_values=None,
        new_values=None,
    )
    await session.commit()
    return {"status": "ok"}


@router.get("/permissions")
async def permissions(
    response: Response,
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, str | bool]]:
    return paginate_sequence(
        [permission.__dict__ for permission in registry.all()],
        limit=limit, offset=offset, response=response,
    )


@router.put("/permissions/grants")
async def grant_permissions(
    payload: PermissionGrantRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    if current_user.role != UserRole.principal:
        raise HTTPException(status_code=403, detail="Only the Principal can grant permissions")

    # Normalise both request forms into (code, scope_type, scope_id) tuples.
    requested = [PermissionGrant(code=code) for code in payload.permission_codes] + payload.grants
    definitions = {}
    try:
        for grant in requested:
            definitions[grant.code] = registry.require_known(grant.code)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    for grant in requested:
        if (grant.scope_type is None) != (grant.scope_id is None):
            raise HTTPException(status_code=400, detail=f"Grant {grant.code}: scope_type and scope_id must be set together")
        if grant.scope_type is not None and not definitions[grant.code].scoped:
            raise HTTPException(
                status_code=400,
                detail=f"Grant {grant.code} is madrasa-wide and cannot be class/section scoped",
            )

    target = await session.get(User, payload.user_id)
    if target is None or target.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")

    for grant in requested:
        if grant.scope_type is None:
            continue
        scope_model = AcademicClass if grant.scope_type == "class" else Section
        scope_exists = await session.scalar(
            select(scope_model.id).where(
                scope_model.id == grant.scope_id,
                scope_model.madrasa_id == madrasa.id,
            )
        )
        if scope_exists is None:
            raise HTTPException(
                status_code=400,
                detail=f"Grant {grant.code}: scope does not belong to the active madrasa",
            )

    existing_stmt = select(UserPermission).where(UserPermission.user_id == payload.user_id)
    existing = (await session.execute(existing_stmt)).scalars().all()
    old_grants = sorted(
        f"{item.permission_code}:{item.scope_type or '*'}:{item.scope_id or '*'}" for item in existing
    )
    for item in existing:
        await session.delete(item)

    deduped = {(g.code, g.scope_type, g.scope_id) for g in requested}
    for code, scope_type, scope_id in sorted(deduped, key=lambda g: (g[0], str(g[1]), str(g[2]))):
        session.add(
            UserPermission(
                user_id=payload.user_id,
                permission_code=code,
                granted_by_id=current_user.id,
                scope_type=str(scope_type) if scope_type else None,
                scope_id=scope_id,
            )
        )
    new_grants = sorted(f"{c}:{st or '*'}:{sid or '*'}" for c, st, sid in deduped)

    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="permissions.grant",
        entity_name="user",
        entity_id=str(payload.user_id),
        old_values={"grants": old_grants},
        new_values={"grants": new_grants},
    )
    await session.commit()

    return {"user_id": payload.user_id, "grants": new_grants, "audited": True}


@router.get("/users/{user_id}/permissions", response_model=list[PermissionGrantRead])
async def list_user_permissions(
    user_id: UUID,
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[PermissionGrantRead]:
    if current_user.role != UserRole.principal and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Only the Principal can view another user's permissions")

    target = await session.get(User, user_id)
    if target is None or target.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")

    rows = await paginate_scalars(
        session,
        select(UserPermission).where(UserPermission.user_id == user_id).order_by(UserPermission.permission_code),
        limit=limit, offset=offset, response=response,
    )
    return [PermissionGrantRead.model_validate(row) for row in rows]
