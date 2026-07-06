from copy import deepcopy
from time import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_mapped_permission
from app.db.session import get_session
from app.modules.auth.models import User
from app.modules.operations.schemas import CreateOperationRecord, OperationActionResponse, OperationModule, OperationRecord

router = APIRouter()

# Every fake "module" this mock stands in for maps to the real permission
# code that will gate it once it's backed by its own table (see SRS Appendix A).
MODULE_PERMISSIONS: dict[str, str] = {
    "auth": "students.provision",
    "academics": "academics.manage",
    "students": "students.view",
    "guardians": "students.view",
    "teachers": "teachers.view",
    "salary": "teachers.salary.manage",
    "assignments": "assignments.manage_all",
    "results": "assessments.results.publish",
    "timetable": "timetable.manage",
    "resources": "resources.manage",
    "forms": "forms.create",
    "announcements": "announcements.post",
    "finance": "finance.manage",
    "messaging": "messaging.send",
    "reports": "finance.reports.view",
    "blog": "blog.manage",
    "admissions": "students.provision",
    "settings": "academics.manage",
}

module_store: dict[str, list[dict[str, str]]] = {
    "auth": [{"id": "usr-1", "username": "principal", "role": "Principal", "state": "Active"}],
    "academics": [{"id": "acad-1", "program": "Hifz", "className": "Darja 1", "section": "A", "course": "Quran"}],
    "students": [{"id": "stu-1", "admissionNumber": "ADM-0001", "name": "Ahmad Ali", "className": "Darja 1", "state": "Active"}],
    "guardians": [{"id": "grd-1", "name": "Abdul Ali", "phone": "923001234567", "students": "Ahmad Ali"}],
    "teachers": [{"id": "tch-1", "code": "TCH-0001", "name": "Maulana Yusuf", "assignment": "Darja 1 Quran"}],
    "salary": [{"id": "sal-1", "teacher": "Maulana Yusuf", "amount": "65000", "period": "June 2026", "state": "Paid"}],
    "assignments": [{"id": "asg-1", "title": "Sabaq revision", "className": "Darja 1", "state": "Open"}],
    "results": [{"id": "res-1", "student": "Ahmad Ali", "course": "Quran", "score": "92", "state": "Published"}],
    "timetable": [{"id": "tt-1", "day": "Monday", "period": "08:00-09:00", "course": "Quran"}],
    "resources": [{"id": "rsc-1", "title": "Hifz revision notes", "type": "PDF", "visibility": "Darja 1"}],
    "forms": [{"id": "frm-1", "title": "Leave request", "audience": "Students", "state": "Open"}],
    "announcements": [{"id": "ann-1", "title": "Holiday notice", "audience": "All", "state": "Published"}],
    "finance": [{"id": "fin-1", "source": "ADM-0001", "amount": "12000", "state": "Receipted"}],
    "messaging": [{"id": "msg-1", "recipient": "Abdul Ali", "phone": "923001234567", "state": "Ready"}],
    "reports": [{"id": "rpt-1", "title": "Attendance summary", "period": "June 2026", "state": "Ready"}],
    "blog": [{"id": "post-1", "title": "Attendance with accountability", "author": "Maulana Yusuf", "state": "Draft"}],
    "admissions": [{"id": "adm-1", "student": "Muhammad Umar", "program": "Hifz", "state": "Pending"}],
    "settings": [{"id": "set-1", "key": "Content language", "value": "Urdu", "state": "Saved"}],
}


@router.get("", response_model=list[str])
async def list_modules(current_user: User = Depends(get_current_user)) -> list[str]:
    return sorted(module_store)


@router.get("/{module_key}", response_model=OperationModule)
async def list_records(
    module_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationModule:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    return OperationModule(key=module_key, records=[to_record(record) for record in records])


@router.post("/{module_key}", response_model=OperationRecord)
async def create_record(
    module_key: str,
    payload: CreateOperationRecord,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationRecord:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    record = {"id": f"{module_key}-{int(time() * 1000)}", **payload.data}
    records.insert(0, record)
    return to_record(record)


@router.post("/{module_key}/{record_id}/actions/{action}", response_model=OperationActionResponse)
async def apply_action(
    module_key: str,
    record_id: str,
    action: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationActionResponse:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    record = next((item for item in records if item["id"] == record_id), None)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")

    record["state"] = action_to_state(action)
    if action == "send":
        record["link"] = build_whatsapp_link(record)
    return OperationActionResponse(record=to_record(record), message=f"{action} complete")


@router.get("/{module_key}/export/csv")
async def export_csv(
    module_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    columns = sorted({key for record in records for key in record})
    lines = [",".join(columns)]
    lines.extend(",".join(record.get(column, "") for column in columns) for record in records)
    return {"filename": f"{module_key}.csv", "content": "\n".join(lines)}


def get_module(module_key: str) -> list[dict[str, str]]:
    if module_key not in module_store:
        raise HTTPException(status_code=404, detail="Unknown module")
    return module_store[module_key]


def to_record(record: dict[str, str]) -> OperationRecord:
    data = deepcopy(record)
    record_id = data.pop("id")
    return OperationRecord(id=record_id, data=data)


def action_to_state(action: str) -> str:
    states = {
        "approve": "Approved",
        "export": "Exported",
        "publish": "Published",
        "receipt": "Receipted",
        "save": "Saved",
        "send": "Sent",
    }
    return states.get(action, "Updated")


def build_whatsapp_link(record: dict[str, str]) -> str:
    phone = record.get("phone", "923001234567").replace("+", "").replace(" ", "")
    return f"https://wa.me/{phone}?text=MMS%20update%20ready"
