import os

from arq.connections import RedisSettings


async def noop(ctx):
    """Placeholder task so the ARQ worker can idle until real jobs are added."""
    return None


class WorkerSettings:
    functions = [noop]
    redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
