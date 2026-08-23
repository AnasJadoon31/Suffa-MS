import asyncio
from sqlalchemy.ext.asyncio import async_engine_from_config

config = {"sqlalchemy.url": "postgres://mms:mms_password@localhost/mms"}
try:
    async_engine_from_config(config, prefix="sqlalchemy.")
    print("postgres:// worked!")
except Exception as e:
    print(f"postgres:// failed: {type(e).__name__} - {e}")

config = {"sqlalchemy.url": "postgresql://mms:mms_password@localhost/mms"}
try:
    async_engine_from_config(config, prefix="sqlalchemy.")
    print("postgresql:// worked!")
except Exception as e:
    print(f"postgresql:// failed: {type(e).__name__} - {e}")

