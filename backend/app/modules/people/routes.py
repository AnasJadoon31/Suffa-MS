from uuid import uuid4

from fastapi import APIRouter

from app.modules.people.schemas import PersonRead, StudentCreate, TeacherCreate

router = APIRouter()


@router.post("/teachers", response_model=PersonRead)
async def create_teacher(payload: TeacherCreate) -> PersonRead:
    return PersonRead(id=uuid4(), code="TCH-0001", name=payload.name)


@router.post("/students", response_model=PersonRead)
async def create_student(payload: StudentCreate) -> PersonRead:
    return PersonRead(id=uuid4(), code="ADM-0001", name=payload.name)


@router.get("/students")
async def students() -> list[dict[str, str]]:
    return [
        {"id": "stu-1", "admission_number": "ADM-0001", "name": "Ahmad Ali", "class": "Darja 1", "status": "active"},
        {"id": "stu-2", "admission_number": "ADM-0002", "name": "Hamza Khan", "class": "Darja 1", "status": "active"},
    ]
