import hashlib
import hmac
import re
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


def set_password_token_version(user: User) -> str:
    """Bind a set-password token to the password state that issued it.

    Changing the password changes this value, so a successfully used token
    cannot be replayed. HMAC keeps the stored password hash out of the JWT.
    """
    return hmac.new(
        settings.secret_key.encode(), user.password_hash.encode(), hashlib.sha256
    ).hexdigest()


async def generate_unique_username(session: AsyncSession, base: str) -> str:
    """Derives a login username from a display name for flows with no
    interactive username prompt (e.g. guardian auto-provisioning at
    enrolment time, B7-k). Usernames are unique across the whole platform
    (see provision_login), so this keeps trying numeric suffixes."""
    slug = re.sub(r"[^a-z0-9]+", ".", base.strip().lower()).strip(".") or "guardian"
    candidate = slug
    suffix = 1
    while True:
        existing = await session.execute(select(User.id).where(User.username == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
        suffix += 1
        candidate = f"{slug}{suffix}"


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
        password_hash=await hash_password(secrets.token_urlsafe(32)),
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
        extra={"purpose": "set-password", "password_version": set_password_token_version(user)},
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


def reissue_set_password_link(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    actor_id: UUID,
    user: User,
) -> str:
    """Issues a fresh one-time set-password link for an existing login —
    the original link from provisioning is only shown once, so staff need a
    way to re-send credentials later (lost link, expired token, forgotten
    password). The current password stays valid until the link is used."""
    token = issue_token(
        str(user.id),
        minutes=settings.set_password_token_hours * 60,
        extra={"purpose": "set-password", "password_version": set_password_token_version(user)},
    )
    record_audit(
        session,
        madrasa_id=madrasa_id,
        actor_id=actor_id,
        action="user.credentials_reissue",
        entity_name="user",
        entity_id=str(user.id),
        old_values={},
        new_values={"username": user.username},
    )
    return f"/set-password?token={token}"
