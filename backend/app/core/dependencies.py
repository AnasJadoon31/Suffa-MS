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
from app.modules.auth.models import User
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


def require_permission(code: str):
    def permission_checker(current_user: User = Depends(get_current_user)):
        # For simplicity, if user is superadmin or has specific permission (would be checked via db normally)
        # In a real app, query UserPermission or attach permissions to current_user
        # We will assume a basic implementation for now.
        if current_user.system_role == "superadmin":
            return current_user
            
        # Check explicit permission
        # In this basic form, we would ideally query the db. We can raise 403 if they don't have it.
        # This will be fully implemented in phase 2 when business APIs are built.
        return current_user
    return Depends(permission_checker)
