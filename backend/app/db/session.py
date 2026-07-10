from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


engine = create_async_engine(
    settings.database_url, 
    pool_pre_ping=True,
    pool_timeout=10,  # Fail fast if connection pool is exhausted
    pool_size=10,     # Increase pool size to handle burst requests
    max_overflow=20
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
