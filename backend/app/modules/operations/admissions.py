"""Shared admission-form validation and immutable snapshot helpers."""

from datetime import date

from fastapi import HTTPException

from app.core.phone import normalize_pakistan_phone
from app.modules.operations.schemas import FormFieldDefinition

BUILT_IN_ADMISSION_FIELDS = {
    "student_name": {"label": "Student name", "type": "text", "required": True, "enabled": True},
    "student_date_of_birth": {"label": "Date of birth", "type": "text", "required": True, "enabled": True},
    "student_b_form_number": {"label": "B-Form number", "type": "text", "required": False, "enabled": True},
    "student_address": {"label": "Student address", "type": "textarea", "required": False, "enabled": True},
    "student_phone": {"label": "Student phone", "type": "phone", "required": False, "enabled": False},
    "student_portal_enabled": {"label": "Student portal", "type": "dropdown", "required": True, "enabled": True, "options": ["enabled", "disabled"]},
    "guardian_name": {"label": "Guardian name", "type": "text", "required": True, "enabled": True},
    "guardian_relationship": {"label": "Guardian relationship", "type": "text", "required": True, "enabled": True},
    "guardian_phone_numbers": {"label": "Guardian phone number", "type": "phone", "required": True, "enabled": True},
    "guardian_cnic": {"label": "Guardian CNIC", "type": "text", "required": False, "enabled": True},
    "guardian_address": {"label": "Guardian address", "type": "textarea", "required": False, "enabled": True},
    "guardian_preferred_language": {"label": "Guardian preferred language", "type": "dropdown", "required": True, "enabled": True, "options": ["ur", "en"]},
    "guardian_portal_enabled": {"label": "Guardian portal", "type": "dropdown", "required": True, "enabled": True, "options": ["enabled", "disabled"]},
}


def normalize_admission_fields(fields_definition: list) -> list[dict]:
    incoming = {
        str(field.get("key") or ""): field
        for field in fields_definition
        if isinstance(field, dict)
    }
    normalized: list[dict] = []
    for key, defaults in BUILT_IN_ADMISSION_FIELDS.items():
        current = incoming.pop(key, {})
        normalized.append({
            "key": key,
            "label": current.get("label") or defaults["label"],
            "type": defaults["type"],
            "required": bool(current.get("required", defaults["required"])),
            "options": defaults.get("options", []),
            "built_in": True,
            "enabled": bool(current.get("enabled", defaults["enabled"])),
        })
    for field in fields_definition:
        if not isinstance(field, dict):
            continue
        key = str(field.get("key") or "")
        if key in BUILT_IN_ADMISSION_FIELDS:
            continue
        normalized.append(FormFieldDefinition.model_validate(field).model_dump())
    return normalized


def enabled_admission_fields(fields_definition: list) -> list[FormFieldDefinition]:
    return [
        field
        for field in (FormFieldDefinition.model_validate(item) for item in normalize_admission_fields(fields_definition))
        if field.enabled
    ]


def admission_answer_text(answers: dict | None, key: str) -> str:
    value = (answers or {}).get(key)
    return str(value or "").strip()


def admission_answer_date(answers: dict | None, key: str) -> date | None:
    value = admission_answer_text(answers, key)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=f"{key} must be YYYY-MM-DD") from error


def admission_answer_enabled(answers: dict | None, key: str, *, default: bool = True) -> bool:
    value = admission_answer_text(answers, key)
    if not value:
        return default
    return value == "enabled"


def admission_guardian_payloads(answers: dict | None) -> list[dict]:
    answers = answers or {}
    guardians: list[dict] = []
    primary = {
        "name": admission_answer_text(answers, "guardian_name"),
        "relationship": admission_answer_text(answers, "guardian_relationship"),
        "phone_numbers": admission_answer_text(answers, "guardian_phone_numbers"),
        "cnic": admission_answer_text(answers, "guardian_cnic") or None,
        "address": admission_answer_text(answers, "guardian_address") or None,
        "preferred_language": admission_answer_text(answers, "guardian_preferred_language") or "ur",
        "portal_enabled": admission_answer_enabled(answers, "guardian_portal_enabled", default=True),
    }
    if primary["name"] or primary["phone_numbers"]:
        guardians.append(primary)

    extra_guardians = answers.get("guardians") or []
    if not isinstance(extra_guardians, list):
        raise HTTPException(status_code=422, detail="guardians must be a list")
    for index, item in enumerate(extra_guardians):
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"guardian {index + 2} must be an object")
        phone = item.get("phone_numbers") or item.get("guardian_phone_numbers") or ""
        try:
            phone = normalize_pakistan_phone(phone) if phone else ""
        except ValueError as error:
            raise HTTPException(status_code=422, detail=f"Invalid phone field: guardians[{index}].phone_numbers") from error
        guardians.append({
            "name": str(item.get("name") or item.get("guardian_name") or "").strip(),
            "relationship": str(item.get("relationship") or item.get("guardian_relationship") or "").strip(),
            "phone_numbers": phone,
            "cnic": str(item.get("cnic") or item.get("guardian_cnic") or "").strip() or None,
            "address": str(item.get("address") or item.get("guardian_address") or "").strip() or None,
            "preferred_language": str(item.get("preferred_language") or item.get("guardian_preferred_language") or "ur").strip(),
            "portal_enabled": (item.get("portal_enabled") or item.get("guardian_portal_enabled") or "enabled") == "enabled",
        })
    return guardians


def validate_admission_answers(fields_definition: list, answers: dict, *, require_guardian: bool = True) -> None:
    fields = enabled_admission_fields(fields_definition)
    answer_fields = {field.key: field for field in fields if field.type != "label"}
    unknown_keys = sorted(set(answers) - set(answer_fields) - {"guardians"})
    if unknown_keys:
        raise HTTPException(status_code=422, detail=f"Unknown form field: {unknown_keys[0]}")

    for key, field in answer_fields.items():
        if not require_guardian and key.startswith("guardian_"):
            continue
        value = answers.get(key)
        is_empty = value is None or value == "" or value == []
        if field.required and is_empty:
            raise HTTPException(status_code=422, detail=f"Required form field is missing: {key}")
        if is_empty:
            continue
        if field.type in {"text", "textarea", "file", "image"} and not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"Form field must be text: {key}")
        if field.type == "phone":
            try:
                answers[key] = normalize_pakistan_phone(value)
            except ValueError as error:
                raise HTTPException(status_code=422, detail=f"Invalid phone field: {key}") from error
        if field.type in {"radio", "dropdown"} and value not in field.options:
            raise HTTPException(status_code=422, detail=f"Invalid option for form field: {key}")
        if field.type == "checkbox_group":
            if not isinstance(value, list) or any(option not in field.options for option in value):
                raise HTTPException(status_code=422, detail=f"Invalid options for form field: {key}")

    for index, guardian in enumerate(admission_guardian_payloads(answers)[1:]):
        if not guardian["name"]:
            raise HTTPException(status_code=422, detail=f"Guardian {index + 2} name is required")
        if not guardian["relationship"]:
            raise HTTPException(status_code=422, detail=f"Guardian {index + 2} relationship is required")
        if not guardian["phone_numbers"]:
            raise HTTPException(status_code=422, detail=f"Guardian {index + 2} phone number is required")
        if guardian["preferred_language"] not in {"ur", "en"}:
            raise HTTPException(status_code=422, detail=f"Guardian {index + 2} preferred language is invalid")
