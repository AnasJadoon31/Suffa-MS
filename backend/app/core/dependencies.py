from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.features import FEATURES
from app.core.error_codes import ErrorCode
from app.core.security import ALGORITHM
from app.core.permissions import registry
from app.db.session import get_session
from app.modules.auth.models import User, UserPermission, UserRole
from app.modules.academics.models import Madrasa, AcademicSession
from app.modules.platform.models import MadrasaFeature

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)


async def set_rls_context(session: AsyncSession, user: User) -> None:
    """Set transaction-local PostgreSQL variables consumed by tenant RLS.

    SQLite test databases intentionally skip this PostgreSQL-only boundary.
    ``is_local=true`` makes pool reuse safe because values disappear when the
    request transaction ends.
    """
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            "SELECT set_config('app.current_madrasa_id', :madrasa_id, true), "
            "set_config('app.is_super_admin', :is_super_admin, true)"
        ),
        {
            "madrasa_id": str(user.madrasa_id) if user.madrasa_id else "",
            "is_super_admin": "true" if user.role == UserRole.super_admin else "false",
        },
    )


async def ensure_request_context_writable(
    request: Request, user: User, session: AsyncSession
) -> None:
    """Reject authenticated writes while a non-active session is selected.

    Profile/password endpoints stay available so a user can recover their
    account or clear the selected session. Explicit route-level guards remain
    useful for payloads that target a session other than the user's context.
    """
    if (
        request.method in {"GET", "HEAD", "OPTIONS"}
        or user.selected_session_id is None
        or request.url.path in {"/api/v1/auth/me", "/api/v1/auth/change-password"}
    ):
        return
    selected_session = (
        await session.execute(
            select(AcademicSession).where(
                AcademicSession.id == user.selected_session_id,
                AcademicSession.madrasa_id == user.madrasa_id,
            )
        )
    ).scalar_one_or_none()
    if selected_session is None or not selected_session.is_active:
        raise HTTPException(
            status_code=403,
            detail=ErrorCode.SESSION_VIEW_ONLY,
        )


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    session: AsyncSession = Depends(get_session),
) -> Optional[User]:
    """For public-facing endpoints that behave differently for staff vs anonymous
    visitors (e.g. the public marketing site) — never raises, just returns None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id = UUID(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        return None

    stmt = select(User).where(User.id == user_id, User.status == "active")
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user is not None:
        await set_rls_context(session, user)
    return user


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = UUID(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    stmt = select(User).where(User.id == user_id, User.status == "active")
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    await set_rls_context(session, user)
    await ensure_request_context_writable(request, user, session)
    return user


async def get_current_madrasa(
    request: Request,
    x_madrasa: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
) -> Madrasa:
    """Resolves the tenant every scoped route filters by.

    OWASP A01 (broken access control): the `X-Madrasa` header is
    client-supplied and MUST NOT decide which tenant's rows an authenticated
    request can read/write — permission checks (`user_has_permission`) carry
    no tenant scope of their own (a Principal is an implicit superuser for
    *whichever* madrasa this function returns), so trusting the header would
    let any authenticated user — e.g. any Principal of any tenant — read or
    mutate a completely different tenant's data just by sending a different
    header value, regardless of role/permission grants. Non-super-admin
    users are therefore pinned to their own `madrasa_id`; the header is
    ignored for them. Only `super_admin` (platform scope, no `madrasa_id` of
    its own) uses the header to pick which tenant it's currently acting on.
    """
    if current_user.role == UserRole.super_admin:
        slug = x_madrasa or settings.default_tenant
        if not slug:
            raise HTTPException(status_code=400, detail="Madrasa tenant not specified")
        stmt = select(Madrasa).where(Madrasa.slug == slug)
        result = await session.execute(stmt)
        madrasa = result.scalar_one_or_none()
        if madrasa is None:
            raise HTTPException(status_code=404, detail="Madrasa not found")
        return madrasa

    if current_user.madrasa_id is None:
        raise HTTPException(status_code=403, detail="User is not attached to any tenant")

    madrasa = await session.get(Madrasa, current_user.madrasa_id)
    if madrasa is None:
        raise HTTPException(status_code=404, detail="Madrasa not found")
    return madrasa


async def get_context_session(
    madrasa: Madrasa = Depends(get_current_madrasa),
    current_user: Optional[User] = Depends(get_optional_user),
    x_academic_session_id: Optional[str] = Header(None, alias="X-Academic-Session-Id"),
    session: AsyncSession = Depends(get_session)
) -> AcademicSession:
    """Resolves the academic-session context: explicit header, then the
    authenticated user's stored preference, then the madrasa's active session."""
    if x_academic_session_id:
        try:
            session_uuid = UUID(x_academic_session_id)
            stmt = select(AcademicSession).where(
                AcademicSession.id == session_uuid,
                AcademicSession.madrasa_id == madrasa.id
            )
            result = await session.execute(stmt)
            academic_session = result.scalar_one_or_none()
            if academic_session:
                return academic_session
        except ValueError:
            pass # Invalid UUID, fallback to preference / active session

    if current_user is not None and current_user.selected_session_id is not None:
        stmt = select(AcademicSession).where(
            AcademicSession.id == current_user.selected_session_id,
            AcademicSession.madrasa_id == madrasa.id,
        )
        result = await session.execute(stmt)
        academic_session = result.scalar_one_or_none()
        if academic_session:
            return academic_session

    # Fallback to the active session
    stmt = select(AcademicSession).where(
        AcademicSession.madrasa_id == madrasa.id,
        AcademicSession.is_active == True
    )
    result = await session.execute(stmt)
    academic_session = result.scalar_one_or_none()

    if not academic_session:
        raise HTTPException(status_code=404, detail="No active academic session found for this madrasa.")

    return academic_session


async def require_active_session(
    context_session: AcademicSession = Depends(get_context_session),
) -> AcademicSession:
    """For mutating routes: only the active academic session accepts writes;
    archived/future sessions are view-only."""
    if not context_session.is_active:
        raise HTTPException(
            status_code=403,
            detail=ErrorCode.SESSION_VIEW_ONLY,
        )
    return context_session


async def require_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


async def get_enabled_features(
    madrasa_id: UUID, session: AsyncSession
) -> dict[str, bool]:
    """Feature map for a madrasa. Missing row = enabled (subtractive model)."""
    result = await session.execute(
        select(MadrasaFeature).where(MadrasaFeature.madrasa_id == madrasa_id)
    )
    overrides = {row.feature_key: row.enabled for row in result.scalars().all()}
    return {feature.key: overrides.get(feature.key, True) for feature in FEATURES}


def require_feature(key: str):
    """Router/route dependency: 403 when the feature is switched off for the
    tenant. Super admins bypass (platform endpoints have their own guard)."""

    async def feature_checker(
        madrasa: Madrasa = Depends(get_current_madrasa),
        current_user: Optional[User] = Depends(get_optional_user),
        session: AsyncSession = Depends(get_session),
    ) -> None:
        if current_user is not None and current_user.role == UserRole.super_admin:
            return
        result = await session.execute(
            select(MadrasaFeature).where(
                MadrasaFeature.madrasa_id == madrasa.id,
                MadrasaFeature.feature_key == key,
            )
        )
        flag = result.scalar_one_or_none()
        if flag is not None and not flag.enabled:
            raise HTTPException(status_code=403, detail=f"Feature '{key}' is not enabled for this madrasa")

    return feature_checker


async def ensure_writable_session(
    session: AsyncSession, madrasa_id: UUID, session_id: UUID
) -> AcademicSession:
    """Payload-level counterpart of require_active_session, for routes that take
    the target academic session id in the request body or path: 404 if the
    session doesn't belong to the tenant, 403 if it isn't the active one."""
    academic_session = await session.get(AcademicSession, session_id)
    if academic_session is None or academic_session.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Academic session not found")
    if not academic_session.is_active:
        raise HTTPException(
            status_code=403,
            detail=ErrorCode.SESSION_VIEW_ONLY,
        )
    return academic_session


async def user_has_permission(user: User, code: str, session: AsyncSession) -> bool:
    """The Principal is an implicit superuser (FR-RBAC-01); every other role
    must hold an explicit, persisted, madrasa-wide grant for the exact
    permission code. Scoped (class/section) grants do NOT satisfy this check —
    use user_has_permission_scoped where a scope is known."""
    if user.role == UserRole.principal:
        return True
    stmt = select(UserPermission).where(
        UserPermission.user_id == user.id,
        UserPermission.permission_code == code,
        UserPermission.scope_type.is_(None),
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


async def user_has_permission_scoped(
    user: User,
    code: str,
    session: AsyncSession,
    *,
    class_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
) -> bool:
    """Scope-aware check: a madrasa-wide grant always passes; a scoped grant
    passes only when it targets the class/section being acted on."""
    if user.role == UserRole.principal:
        return True
    stmt = select(UserPermission).where(
        UserPermission.user_id == user.id,
        UserPermission.permission_code == code,
    )
    result = await session.execute(stmt)
    for grant in result.scalars().all():
        if grant.scope_type is None:
            return True
        if grant.scope_type == "class" and class_id is not None and grant.scope_id == class_id:
            return True
        if grant.scope_type == "section" and section_id is not None and grant.scope_id == section_id:
            return True
    return False


async def user_has_permission_grant(user: User, code: str, session: AsyncSession) -> bool:
    """Return whether the user has this permission at any scope.

    This is the appropriate entry gate for endpoints that validate the actual
    class/section later from their payload. Using the madrasa-wide-only check
    there made correctly delegated, scoped permissions impossible to use.
    """
    if user.role == UserRole.principal:
        return True
    stmt = select(UserPermission.id).where(
        UserPermission.user_id == user.id,
        UserPermission.permission_code == code,
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


def require_permission(code: str):
    """Returns a dependency callable — use as Depends(require_permission("some.code"))."""
    registry.require_known(code)  # fail fast at import time on a typo'd code

    async def permission_checker(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if not await user_has_permission(current_user, code, session):
            raise HTTPException(status_code=403, detail=ErrorCode.PERMISSION_REQUIRED)
        return current_user

    return permission_checker


def require_permission_grant(code: str):
    """Require a grant at any scope; payload-level scope checks must follow."""
    registry.require_known(code)

    async def permission_checker(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if not await user_has_permission_grant(current_user, code, session):
            raise HTTPException(status_code=403, detail=ErrorCode.PERMISSION_REQUIRED)
        return current_user

    return permission_checker


def require_teacher_or_permission(code: str):
    """Require either a teacher role or a specific permission grant."""
    registry.require_known(code)

    async def permission_checker(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if current_user.role == UserRole.teacher:
            return current_user
        if not await user_has_permission_grant(current_user, code, session):
            raise HTTPException(status_code=403, detail=ErrorCode.PERMISSION_REQUIRED)
        return current_user

    return permission_checker


async def require_mapped_permission(
    key: str,
    permission_map: dict[str, str],
    current_user: User,
    session: AsyncSession,
) -> None:
    """Same enforcement as require_permission(), for routes where the
    permission code depends on a path parameter known only at request time
    (e.g. the operations module's shared /{module_key} routes)."""
    code = permission_map.get(key)
    if code is None:
        raise HTTPException(status_code=404, detail="Unknown module")
    if not await user_has_permission(current_user, code, session):
        raise HTTPException(status_code=403, detail=f"Missing permission: {code}")
