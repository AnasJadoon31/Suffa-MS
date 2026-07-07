import redis.asyncio as redis
from fastapi import HTTPException, status

from app.core.config import settings

LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def assert_not_locked_out(key: str, max_attempts: int) -> None:
    """Raises 429 if `key` has already recorded `max_attempts` failures within its window."""
    client = get_redis()
    attempts = await client.get(key)
    if attempts is not None and int(attempts) >= max_attempts:
        ttl = await client.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {max(ttl, 1)} seconds.",
        )


async def record_failure(key: str, window_seconds: int) -> None:
    client = get_redis()
    current = await client.incr(key)
    if current == 1:
        await client.expire(key, window_seconds)


async def clear_failures(key: str) -> None:
    await get_redis().delete(key)
