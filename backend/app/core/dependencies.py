from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import ALGORITHM
from app.core.permissions import registry
from app.db.session import get_session
from app.modules.auth.models import User, UserPermission, UserRole
from app.modules.academics.models import Madrasa

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

async def get_current_user(
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
    return user


async def get_current_madrasa(
    request: Request,
    x_madrasa: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_session)
) -> Madrasa:
    slug = x_madrasa or settings.default_tenant
    if not slug:
        raise HTTPException(status_code=400, detail="Madrasa tenant not specified")

    stmt = select(Madrasa).where(Madrasa.slug == slug)
    result = await session.execute(stmt)
    madrasa = result.scalar_one_or_none()
    if madrasa is None:
        raise HTTPException(status_code=404, detail="Madrasa not found")

    return madrasa


async def user_has_permission(user: User, code: str, session: AsyncSession) -> bool:
    """The Principal is an implicit superuser (FR-RBAC-01); every other role
    must hold an explicit, persisted grant for the exact permission code."""
    if user.role == UserRole.principal:
        return True
    stmt = select(UserPermission).where(
        UserPermission.user_id == user.id,
        UserPermission.permission_code == code,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


def require_permission(code: str):
    """Returns a dependency callable — use as Depends(require_permission("some.code"))."""
    registry.require_known(code)  # fail fast at import time on a typo'd code

    async def permission_checker(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if not await user_has_permission(current_user, code, session):
            raise HTTPException(status_code=403, detail=f"Missing permission: {code}")
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
