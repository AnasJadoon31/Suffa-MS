import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import settings
from app.core.security import hash_password, issue_token
from app.modules.auth.models import User, UserRole, UserStatus


class UsernameTakenError(ValueError):
    pass


async def provision_login(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    actor_id: UUID,
    username: str,
    role: UserRole,
    preferred_language: str = "en",
    portal_enabled: bool = True,
) -> tuple[User, str]:
    """Creates the User row behind a new teacher/student/principal login and
    returns it alongside a one-time set-password link (FR-AUTH-01/03). The
    account is unusable — a random, never-transmitted password — until the
    link is completed via POST /auth/set-password."""
    existing = await session.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none() is not None:
        raise UsernameTakenError(f"Username '{username}' already exists")

    user = User(
        madrasa_id=madrasa_id,
        username=username,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role=role,
        preferred_language=preferred_language,
        status=UserStatus.invited,
        portal_enabled=portal_enabled,
    )
    session.add(user)
    await session.flush()

    token = issue_token(
        str(user.id),
        minutes=settings.set_password_token_hours * 60,
        extra={"purpose": "set-password"},
    )
    set_password_url = f"/set-password?token={token}"

    record_audit(
        session,
        madrasa_id=madrasa_id,
        actor_id=actor_id,
        action="user.provision",
        entity_name="user",
        entity_id=str(user.id),
        old_values={},
        new_values={"username": user.username, "role": str(user.role)},
    )

    return user, set_password_url
