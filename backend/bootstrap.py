"""Idempotent first-boot setup.

Ensures the default tenant and one Principal login exist so a fresh deploy is
immediately usable. Optionally creates a platform super-admin when
SUPER_ADMIN_PASSWORD is provided. Safe to run on every container start — it
does nothing once the relevant users already exist.
"""
import asyncio
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.db import core_models  # ensure FileObject table is imported for FK resolution
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole, UserStatus
from app.modules.messaging.models import MessageTemplate
from app.modules.people.models import TeacherProfile

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
    super_admin_username = os.getenv("SUPER_ADMIN_USERNAME", "platform-admin")
    super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD")

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
            admin_user = User(
                madrasa_id=madrasa.id,
                username=admin_username,
                password_hash=await hash_password(admin_password),
                role=UserRole.principal,
                status=UserStatus.active,
            )
            session.add(admin_user)
            await session.flush()
            session.add(
                TeacherProfile(
                    madrasa_id=madrasa.id,
                    user_id=admin_user.id,
                    employee_code="ADMIN",
                    name="Admin",
                    whatsapp_number="+920000000000",
                    is_principal_delegate=True,
                    status="active",
                )
            )
            print(f"[bootstrap] created Principal login '{admin_username}' for tenant '{tenant_slug}'")
        else:
            print(f"[bootstrap] tenant '{tenant_slug}' already has a Principal login, skipping")
            # Backfill: ensure existing principals have a TeacherProfile.
            admin_user = existing_admin
            existing_profile = (
                await session.execute(
                    select(TeacherProfile).where(
                        TeacherProfile.user_id == admin_user.id,
                        TeacherProfile.madrasa_id == madrasa.id,
                    )
                )
            ).scalar_one_or_none()
            if existing_profile is None:
                session.add(
                    TeacherProfile(
                        madrasa_id=madrasa.id,
                        user_id=admin_user.id,
                        employee_code="ADMIN",
                        name="Admin",
                        whatsapp_number="+920000000000",
                        is_principal_delegate=True,
                        status="active",
                    )
                )
                await session.flush()
                print(f"[bootstrap] created TeacherProfile for existing Principal '{admin_user.username}'")

        existing_super_admin = (
            await session.execute(
                select(User).where(
                    User.madrasa_id.is_(None),
                    User.username == super_admin_username,
                    User.role == UserRole.super_admin,
                )
            )
        ).scalar_one_or_none()
        if existing_super_admin is None and super_admin_password:
            session.add(
                User(
                    madrasa_id=None,
                    username=super_admin_username,
                    password_hash=await hash_password(super_admin_password),
                    role=UserRole.super_admin,
                    status=UserStatus.active,
                )
            )
            print(f"[bootstrap] created platform super-admin login '{super_admin_username}'")
        elif existing_super_admin is not None:
            print(f"[bootstrap] platform super-admin '{super_admin_username}' already exists, skipping")
        else:
            print("[bootstrap] SUPER_ADMIN_PASSWORD not set, skipping platform super-admin creation")

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
