from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import bootstrap as bootstrap_module
import app.db.models  # noqa: F401 - registers all models on Base metadata
from app.core.security import verify_password
from app.db.base import Base
from app.modules.auth.models import User, UserRole, UserStatus


async def test_bootstrap_creates_optional_super_admin(tmp_path, monkeypatch):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'bootstrap.db'}"
    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()

    monkeypatch.setattr(bootstrap_module.settings, "database_url", database_url)
    monkeypatch.setattr(bootstrap_module.settings, "default_tenant", "default")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "principal-pass")
    monkeypatch.setenv("SUPER_ADMIN_USERNAME", "platform-admin")
    monkeypatch.setenv("SUPER_ADMIN_PASSWORD", "platform-pass")

    await bootstrap_module.bootstrap()

    query_engine = create_async_engine(database_url)
    Session = async_sessionmaker(query_engine, expire_on_commit=False)
    async with Session() as session:
        super_admin = (
            await session.execute(
                select(User).where(
                    User.username == "platform-admin",
                    User.role == UserRole.super_admin,
                    User.madrasa_id.is_(None),
                )
            )
        ).scalar_one()
        assert super_admin.status == UserStatus.active
        assert await verify_password("platform-pass", super_admin.password_hash)

    await query_engine.dispose()
