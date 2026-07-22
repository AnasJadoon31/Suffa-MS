from typing import Annotated

from pydantic import field_validator, model_validator
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

    # Optional Evolution API v2 connection. When configured, WhatsApp report
    # and receipt actions send the PDF as a real document instead of opening
    # a click-to-chat URL that cannot pre-attach files.
    evolution_api_url: str = ""
    evolution_api_key: str = ""
    evolution_instance: str = ""
    # The single configured Evolution instance belongs only to this tenant.
    # Empty falls back to DEFAULT_TENANT for single-tenant deployments.
    evolution_tenant_slug: str = ""

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

    @model_validator(mode="after")
    def _validate_production_settings(self) -> "Settings":
        if self.environment.lower() == "development":
            return self

        unsafe_secrets = {"", "change-me", "dev-only-change-me"}
        if (
            self.secret_key in unsafe_secrets
            or self.secret_key.startswith("replace-")
            or len(self.secret_key) < 32
        ):
            raise ValueError("SECRET_KEY must be a random value of at least 32 characters in production")
        if (
            not self.database_url
            or "mms_password@localhost" in self.database_url
            or "replace-db-password" in self.database_url
            or "postgres-host" in self.database_url
        ):
            raise ValueError("DATABASE_URL must be explicitly configured in production")
        if (
            not self.redis_url
            or "localhost:6379" in self.redis_url
            or "redis-host" in self.redis_url
        ):
            raise ValueError("REDIS_URL must be explicitly configured in production")
        return self


settings = Settings()
