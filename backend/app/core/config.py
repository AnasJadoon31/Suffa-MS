from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" keeps interactive API docs on; anything else switches
    # them off and enables production posture.
    environment: str = "development"
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
    # OWASP A04/A08 file-upload guardrails: comma-separated MIME allowlist and
    # a max declared size (bytes) enforced at presign time. Overridable per
    # deployment via .env.
    upload_allowed_content_types: Annotated[list[str], NoDecode] = [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]
    upload_max_size_bytes: int = 20 * 1024 * 1024  # 20MB

    @field_validator("upload_allowed_content_types", mode="before")
    @classmethod
    def _split_content_types(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value: str | list[str]) -> list[str]:
        # Lets a platform env-var UI (Coolify, etc.) set a plain
        # comma-separated string instead of a JSON array.
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
