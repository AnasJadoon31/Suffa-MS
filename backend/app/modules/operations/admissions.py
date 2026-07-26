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
    "guardian_name": {"label": "Guardian name", "type": "text", "required": True, "enabled": True},
    "guardian_relationship": {"label": "Guardian relationship", "type": "text", "required": True, "enabled": True},
    "guardian_phone_numbers": {"label": "Guardian phone number", "type": "phone", "required": True, "enabled": True},
    "guardian_cnic": {"label": "Guardian CNIC", "type": "text", "required": False, "enabled": True},
    "guardian_address": {"label": "Guardian address", "type": "textarea", "required": False, "enabled": True},
    "guardian_preferred_language": {"label": "Guardian preferred language", "type": "dropdown", "required": True, "enabled": True, "options": ["ur", "en"]},
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


def validate_admission_answers(fields_definition: list, answers: dict) -> None:
    fields = enabled_admission_fields(fields_definition)
    answer_fields = {field.key: field for field in fields if field.type != "label"}
    unknown_keys = sorted(set(answers) - set(answer_fields))
    if unknown_keys:
        raise HTTPException(status_code=422, detail=f"Unknown form field: {unknown_keys[0]}")

    for key, field in answer_fields.items():
        value = answers.get(key)
        is_empty = value is None or value == "" or value == []
        if field.required and is_empty:
            raise HTTPException(status_code=422, detail=f"Required form field is missing: {key}")
        if is_empty:
            continue
        if field.type in {"text", "textarea"} and not isinstance(value, str):
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
