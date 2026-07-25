import pytest
from pydantic import BaseModel, ValidationError

from app.core.phone import PakistanPhone, evolution_number, normalize_pakistan_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("03001234567", "+923001234567"),
        ("3001234567", "+923001234567"),
        ("+92 300 123 4567", "+923001234567"),
        ("923001234567", "+923001234567"),
        ("0092-300-1234567", "+923001234567"),
    ],
)
def test_phone_normalizes_common_pakistan_formats(raw: str, expected: str):
    assert normalize_pakistan_phone(raw) == expected
    assert evolution_number(raw) == expected.removeprefix("+")


@pytest.mark.parametrize(
    "raw",
    [
        "0300123456",
        "030012345678",
        "+92211234567",
        "+92923001234567",
        "javascript:alert(1)",
    ],
)
def test_phone_rejects_invalid_or_double_prefixed_values(raw: str):
    with pytest.raises(ValueError):
        normalize_pakistan_phone(raw)


def test_phone_type_normalizes_at_pydantic_boundary():
    class Contact(BaseModel):
        phone: PakistanPhone

    assert Contact(phone="03001234567").phone == "+923001234567"
    with pytest.raises(ValidationError):
        Contact(phone="123")
