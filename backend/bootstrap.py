"""Idempotent first-boot setup: ensures the default tenant and one Principal
login exist so a fresh deploy is immediately usable. Safe to run on every
container start — does nothing once the madrasa/admin already exist."""
import asyncio
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole, UserStatus


async def bootstrap() -> None:
    engine = create_async_engine(settings.database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    tenant_slug = settings.default_tenant
    tenant_name = os.getenv("MADRASA_NAME", tenant_slug.title())
    admin_username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
    admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")

    async with SessionLocal() as session:
        madrasa = (
            await session.execute(select(Madrasa).where(Madrasa.slug == tenant_slug))
        ).scalar_one_or_none()
        if madrasa is None:
            madrasa = Madrasa(slug=tenant_slug, name=tenant_name, content_language="ur")
            session.add(madrasa)
            await session.flush()
            print(f"[bootstrap] created madrasa '{tenant_slug}'")

        existing_admin = (
            await session.execute(
                select(User).where(User.madrasa_id == madrasa.id, User.role == UserRole.principal)
            )
        ).scalar_one_or_none()
        if existing_admin is None:
            if not admin_password:
                raise RuntimeError(
                    "No Principal exists yet and BOOTSTRAP_ADMIN_PASSWORD is not set — "
                    "set it in the environment for the first deploy so an initial login can be created."
                )
            session.add(
                User(
                    madrasa_id=madrasa.id,
                    username=admin_username,
                    password_hash=hash_password(admin_password),
                    role=UserRole.principal,
                    status=UserStatus.active,
                )
            )
            print(f"[bootstrap] created Principal login '{admin_username}' for tenant '{tenant_slug}'")
        else:
            print(f"[bootstrap] tenant '{tenant_slug}' already has a Principal login, skipping")

        await session.commit()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(bootstrap())
