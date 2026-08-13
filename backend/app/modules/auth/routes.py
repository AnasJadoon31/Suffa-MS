import hmac
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from jose import JWTError, jwt
from sqlalchemy import delete, func, or_, select
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
    _user_is_admin,
    get_current_user,
    get_current_madrasa,
    get_enabled_features,
    require_permission,
    set_rls_context,
)
from app.db.session import get_session
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus, PermissionRole, PermissionRoleGrant, UserRoleAssignment
from app.modules.auth.service import UsernameTakenError, provision_login, set_password_token_version
from app.modules.academics.models import AcademicClass, AcademicSession, Madrasa, Section
from app.modules.operations.models import MadrasaSetting, TimetableSlot
from app.modules.people.models import TeacherProfile
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PermissionGrant,
    PermissionGrantRead,
    PermissionGrantRequest,
    PermissionRoleCreate,
    PermissionRoleRead,
    PermissionRoleUpdate,
    ProvisionUserRequest,
    ProvisionUserResponse,
    Role,
    RoleAssignRequest,
    SetPasswordRequest,
    TokenResponse,
    CurrentUserResponse,
    UpdateMeRequest,
    UserRead,
    MadrasaRead
)

router = APIRouter()

_DEFAULT_TOKEN_MINUTES = 30


async def _donor_portal_enabled(session: AsyncSession, madrasa_id) -> bool:
    value = await session.scalar(
        select(MadrasaSetting.value).where(
            MadrasaSetting.madrasa_id == madrasa_id,
            MadrasaSetting.key == "portal.donors_can_login",
        )
    )
    return value == "true"


async def _student_portal_enabled(session: AsyncSession, madrasa_id) -> bool:
    value = await session.scalar(
        select(MadrasaSetting.value).where(
            MadrasaSetting.madrasa_id == madrasa_id,
            MadrasaSetting.key == "portal.students_can_login",
        )
    )
    return value == "true"


async def _guardian_portal_enabled(session: AsyncSession, madrasa_id) -> bool:
    value = await session.scalar(
        select(MadrasaSetting.value).where(
            MadrasaSetting.madrasa_id == madrasa_id,
            MadrasaSetting.key == "portal.guardians_can_login",
        )
    )
    return value == "true"


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

    stmt = (
        select(User)
        .outerjoin(Madrasa, Madrasa.id == User.madrasa_id)
        .where(
            User.username == payload.username,
            User.status == UserStatus.active,
            or_(User.role == UserRole.super_admin, Madrasa.slug == tenant.slug),
        )
    )
    result = await session.execute(stmt)
    candidates = result.scalars().all()
    user = None
    for candidate in candidates:
        if await verify_password(payload.password, candidate.password_hash):
            user = candidate
            break

    if user is None:
        await record_failure(lockout_key, LOGIN_LOCKOUT_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        if user.role == UserRole.donor and user.madrasa_id is not None and not await _donor_portal_enabled(session, user.madrasa_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor portal access is disabled by this madrasa")
        if user.role == UserRole.student and user.madrasa_id is not None and not await _student_portal_enabled(session, user.madrasa_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student portal access is disabled by this madrasa")
        if user.role == UserRole.guardian and user.madrasa_id is not None and not await _guardian_portal_enabled(session, user.madrasa_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Guardian portal access is disabled by this madrasa")
    except HTTPException:
        raise
    except Exception:
        pass

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
    is_delegate = False
    if current_user.role == UserRole.teacher or current_user.role == UserRole.principal:
        is_delegate = await session.scalar(
            select(TeacherProfile.is_principal_delegate).where(TeacherProfile.user_id == current_user.id)
        ) or False

    if current_user.role == UserRole.principal or is_delegate:
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
                    "madrasa.name_en", "madrasa.name_ur",
                ]),
            )
        )
    ).all()
    has_teaching_assignment = False
    if current_user.role == UserRole.teacher or current_user.role == UserRole.principal:
        has_teaching_assignment = await session.scalar(
            select(TimetableSlot.id)
            .join(TeacherProfile, TeacherProfile.id == TimetableSlot.teacher_id)
            .join(AcademicSession, AcademicSession.id == TimetableSlot.session_id)
            .where(
                TimetableSlot.madrasa_id == madrasa.id,
                TeacherProfile.user_id == current_user.id,
                AcademicSession.is_active.is_(True),
            )
            .limit(1)
        ) is not None

    user_read = UserRead.model_validate(current_user)
    user_read.is_principal_delegate = is_delegate

    branding = {key: value for key, value in profile_rows}
    madrasa_read = MadrasaRead.model_validate(madrasa)
    madrasa_read.logo_file_key = branding.get("madrasa.logo_file_id") or None

    return CurrentUserResponse(
        user=user_read,
        madrasa=madrasa_read,
        permissions=permissions,
        features=await get_enabled_features(madrasa.id, session),
        branding={**branding, "madrasa.name_en": madrasa.name},
        has_teaching_assignment=has_teaching_assignment,
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

    if payload.username is not None and payload.username != user.username:
        existing = await session.scalar(
            select(User.id).where(
                User.username == payload.username,
                User.madrasa_id.is_(None) if user.role == UserRole.super_admin else User.madrasa_id == user.madrasa_id,
                User.id != user.id,
            )
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = payload.username

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

    user = await session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None or user.status == UserStatus.disabled:
        raise HTTPException(status_code=400, detail="This link has already been used or is invalid")

    token_version = token_payload.get("password_version")
    if token_version is None:
        # Preserve unexpired pre-deployment invitation links. Legacy tokens
        # cannot reset an already-active account because they have no replay
        # binding.
        if user.status != UserStatus.invited:
            raise HTTPException(status_code=400, detail="This link has already been used or is invalid")
    elif not isinstance(token_version, str) or not hmac.compare_digest(
        token_version, set_password_token_version(user)
    ):
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
    if not await _user_is_admin(current_user, session):
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
    if not await _user_is_admin(current_user, session) and current_user.id != user_id:
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


# ---------------------------------------------------------------- Roles

@router.get("/roles", response_model=list[PermissionRoleRead])
async def list_roles(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[PermissionRoleRead]:
    rows = await paginate_scalars(
        session,
        select(PermissionRole).where(PermissionRole.madrasa_id == madrasa.id).order_by(PermissionRole.name),
        limit=limit, offset=offset, response=response,
    )
    result = []
    for role in rows:
        grants = await session.execute(
            select(PermissionRoleGrant.permission_code).where(PermissionRoleGrant.role_id == role.id)
        )
        codes = grants.scalars().all()
        user_count = await session.scalar(
            select(func.count(UserRoleAssignment.id)).where(UserRoleAssignment.role_id == role.id)
        )
        d = PermissionRoleRead.model_validate(role)
        d.permission_codes = list(codes)
        d.user_count = user_count or 0
        result.append(d)
    return result


@router.post("/roles", response_model=PermissionRoleRead)
async def create_role(
    payload: PermissionRoleCreate,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> PermissionRoleRead:
    role = PermissionRole(madrasa_id=madrasa.id, name=payload.name)
    session.add(role)
    await session.flush()
    for code in payload.permission_codes:
        session.add(PermissionRoleGrant(role_id=role.id, permission_code=code))
    await session.commit()
    await session.refresh(role)
    d = PermissionRoleRead.model_validate(role)
    d.permission_codes = payload.permission_codes
    return d


@router.put("/roles/{role_id}", response_model=PermissionRoleRead)
async def update_role(
    role_id: UUID,
    payload: PermissionRoleUpdate,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> PermissionRoleRead:
    role = await session.get(PermissionRole, role_id)
    if not role or role.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Role not found")
    if payload.name is not None:
        role.name = payload.name
    if payload.permission_codes is not None:
        await session.execute(
            delete(PermissionRoleGrant).where(PermissionRoleGrant.role_id == role_id)
        )
        for code in payload.permission_codes:
            session.add(PermissionRoleGrant(role_id=role_id, permission_code=code))
    await session.commit()
    await session.refresh(role)
    d = PermissionRoleRead.model_validate(role)
    d.permission_codes = payload.permission_codes if payload.permission_codes is not None else []
    return d


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: UUID,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    role = await session.get(PermissionRole, role_id)
    if not role or role.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Role not found")
    await session.execute(delete(UserRoleAssignment).where(UserRoleAssignment.role_id == role_id))
    await session.execute(delete(PermissionRoleGrant).where(PermissionRoleGrant.role_id == role_id))
    await session.delete(role)
    await session.commit()
    return {"status": "deleted"}


@router.post("/roles/assign")
async def assign_role(
    payload: RoleAssignRequest,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    user = await session.get(User, payload.user_id)
    if not user or user.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")
    role = await session.get(PermissionRole, payload.role_id)
    if not role or role.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Role not found")

    existing = await session.scalar(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == payload.user_id,
            UserRoleAssignment.role_id == payload.role_id,
        )
    )
    if existing:
        return {"status": "already_assigned"}

    assign = UserRoleAssignment(user_id=payload.user_id, role_id=payload.role_id)
    session.add(assign)

    grants = await session.execute(
        select(PermissionRoleGrant.permission_code).where(PermissionRoleGrant.role_id == payload.role_id)
    )
    for code in grants.scalars().all():
        session.add(UserPermission(user_id=payload.user_id, permission_code=code, granted_by_id=current_user.id))

    await session.commit()
    return {"status": "assigned"}


@router.post("/roles/unassign")
async def unassign_role(
    payload: RoleAssignRequest,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    user = await session.get(User, payload.user_id)
    if not user or user.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")
    role = await session.get(PermissionRole, payload.role_id)
    if not role or role.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Role not found")

    await session.execute(
        delete(UserRoleAssignment).where(
            UserRoleAssignment.user_id == payload.user_id,
            UserRoleAssignment.role_id == payload.role_id,
        )
    )

    grants = await session.execute(
        select(PermissionRoleGrant.permission_code).where(PermissionRoleGrant.role_id == payload.role_id)
    )
    for code in grants.scalars().all():
        await session.execute(
            delete(UserPermission).where(
                UserPermission.user_id == payload.user_id,
                UserPermission.permission_code == code,
            )
        )

    await session.commit()
    return {"status": "unassigned"}


@router.get("/users/{user_id}/roles", response_model=list[PermissionRoleRead])
async def list_user_roles(
    user_id: UUID,
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[PermissionRoleRead]:
    user = await session.get(User, user_id)
    if not user or user.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="User not found")

    stmt = (
        select(PermissionRole)
        .join(UserRoleAssignment, PermissionRole.id == UserRoleAssignment.role_id)
        .where(UserRoleAssignment.user_id == user_id)
    )
    rows = await paginate_scalars(
        session,
        stmt.order_by(PermissionRole.name),
        limit=limit,
        offset=offset,
        response=response,
    )
    result = []
    for role in rows:
        grants = await session.execute(
            select(PermissionRoleGrant.permission_code).where(PermissionRoleGrant.role_id == role.id)
        )
        codes = grants.scalars().all()
        d = PermissionRoleRead.model_validate(role)
        d.permission_codes = list(codes)
        result.append(d)
    return result
