from datetime import date
from uuid import UUID

from pydantic import BaseModel


class TeacherCreate(BaseModel):
    name: str
    whatsapp_number: str | None = None
    qualifications: str | None = None
    join_date: date | None = None


class StudentCreate(BaseModel):
    name: str
    date_of_birth: date | None = None
    portal_enabled: bool = True


class PersonRead(BaseModel):
    id: UUID
    code: str
    name: str
    status: str = "active"
