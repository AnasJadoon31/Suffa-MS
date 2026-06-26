from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://mms:mms@localhost:5432/mms"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-only-change-me"
    default_tenant: str = "default"
    cors_origins: list[AnyHttpUrl | str] = ["http://localhost:5173", "http://localhost:3000"]
    set_password_token_hours: int = 24


settings = Settings()
