from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://mms:mms_password@localhost:5432/mms"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-only-change-me"
    default_tenant: str = "default"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://localhost:3000"]
    set_password_token_hours: int = 24

    # Object storage (S3-compatible / MinIO). Empty by default — file
    # upload endpoints stay disabled until these are configured.
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "mms-files"
    s3_public_url: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value: str | list[str]) -> list[str]:
        # Lets a platform env-var UI (Coolify, etc.) set a plain
        # comma-separated string instead of a JSON array.
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
