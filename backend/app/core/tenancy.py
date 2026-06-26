from dataclasses import dataclass

from fastapi import Header

from app.core.config import settings


@dataclass(frozen=True)
class TenantContext:
    slug: str


async def get_tenant(x_madrasa: str | None = Header(default=None)) -> TenantContext:
    return TenantContext(slug=x_madrasa or settings.default_tenant)
