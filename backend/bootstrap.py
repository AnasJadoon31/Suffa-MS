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
from app.modules.messaging.models import MessageTemplate

# Wording per SRS Appendix C — Sample WhatsApp Templates.
DEFAULT_TEMPLATES = [
    {
        "code": "performance_report",
        "name": "Performance report",
        "content": {
            "en": (
                "Assalamu Alaikum {guardian_name},\n"
                "Result for {student_name} ({class_name}), {session}:\n"
                "{summary_line}\n"
                "Full result card: {result_link}\n"
                "— {madrasa_name}"
            ),
            "ur": (
                "السلام علیکم {guardian_name}،\n"
                "{student_name} ({class_name}) کا نتیجہ، {session}:\n"
                "{summary_line}\n"
                "مکمل نتیجہ کارڈ: {result_link}\n"
                "— {madrasa_name}"
            ),
        },
    },
    {
        "code": "credentials",
        "name": "Login credentials",
        "content": {
            "en": (
                "Assalamu Alaikum,\n"
                "Portal access for {student_name}.\n"
                "Username: {username}\n"
                "Set your password (valid 24h): {setup_link}\n"
                "— {madrasa_name}"
            ),
            "ur": (
                "السلام علیکم،\n"
                "{student_name} کے پورٹل تک رسائی۔\n"
                "صارف نام: {username}\n"
                "اپنا پاس ورڈ مقرر کریں (24 گھنٹے کارآمد): {setup_link}\n"
                "— {madrasa_name}"
            ),
        },
    },
    {
        "code": "receipt",
        "name": "Payment/donation receipt",
        "content": {
            "en": (
                "Assalamu Alaikum {payer_name},\n"
                "Receipt {receipt_no}: {amount} received for {category} on {date}.\n"
                "JazakAllah khair.\n"
                "— {madrasa_name}"
            ),
            "ur": (
                "السلام علیکم {payer_name}،\n"
                "رسید {receipt_no}: {category} کی مد میں {amount} موصول ہوئے ({date})۔\n"
                "جزاک اللہ خیر۔\n"
                "— {madrasa_name}"
            ),
        },
    },
]


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
                    password_hash=await hash_password(admin_password),
                    role=UserRole.principal,
                    status=UserStatus.active,
                )
            )
            print(f"[bootstrap] created Principal login '{admin_username}' for tenant '{tenant_slug}'")
        else:
            print(f"[bootstrap] tenant '{tenant_slug}' already has a Principal login, skipping")

        existing_codes = set(
            (
                await session.execute(
                    select(MessageTemplate.code).where(MessageTemplate.madrasa_id == madrasa.id)
                )
            ).scalars().all()
        )
        for template in DEFAULT_TEMPLATES:
            if template["code"] not in existing_codes:
                session.add(MessageTemplate(madrasa_id=madrasa.id, **template))
                print(f"[bootstrap] created message template '{template['code']}'")

        await session.commit()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(bootstrap())
