from pydantic import BaseModel, Field


class OperationRecord(BaseModel):
    id: str
    data: dict[str, str] = Field(default_factory=dict)


class CreateOperationRecord(BaseModel):
    data: dict[str, str]


class OperationActionResponse(BaseModel):
    record: OperationRecord
    message: str


class OperationModule(BaseModel):
    key: str
    records: list[OperationRecord]
