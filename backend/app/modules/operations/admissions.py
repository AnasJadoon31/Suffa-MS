"""Shared admission-form validation and immutable snapshot helpers."""

from fastapi import HTTPException

from app.modules.operations.schemas import FormFieldDefinition


def validate_admission_answers(fields_definition: list, answers: dict) -> None:
    fields = [FormFieldDefinition.model_validate(field) for field in fields_definition]
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
        if field.type in {"radio", "dropdown"} and value not in field.options:
            raise HTTPException(status_code=422, detail=f"Invalid option for form field: {key}")
        if field.type == "checkbox_group":
            if not isinstance(value, list) or any(option not in field.options for option in value):
                raise HTTPException(status_code=422, detail=f"Invalid options for form field: {key}")
