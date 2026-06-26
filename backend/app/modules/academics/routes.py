from uuid import uuid4

from fastapi import APIRouter, Depends

from app.core.tenancy import TenantContext, get_tenant
from app.modules.academics.schemas import AcademicSessionCreate, ProgramCreate, ProgramRead

router = APIRouter()


@router.get("/structure")
async def structure(tenant: TenantContext = Depends(get_tenant)) -> dict[str, object]:
    return {
        "tenant": tenant.slug,
        "programs": [
            {"id": "seed-hifz", "name": "Hifz", "classes": [{"name": "Darja 1", "sections": ["A"], "courses": ["Quran"]}]}
        ],
    }


@router.post("/programs", response_model=ProgramRead)
async def create_program(payload: ProgramCreate) -> ProgramRead:
    return ProgramRead(id=uuid4(), name=payload.name)


@router.post("/sessions")
async def create_session(payload: AcademicSessionCreate) -> dict[str, object]:
    return {"id": uuid4(), **payload.model_dump()}
