from datetime import date
from uuid import UUID

from pydantic import BaseModel


class ProgramCreate(BaseModel):
    name: str


class ProgramRead(BaseModel):
    id: UUID
    name: str


class AcademicSessionCreate(BaseModel):
    name: str
    gregorian_start: date
    gregorian_end: date
    hijri_span: str
    is_active: bool = False
