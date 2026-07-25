"""Canonical Pakistan mobile phone parsing.

Application boundaries store phone values in E.164 (``+923XXXXXXXXX``).
Evolution API payloads can derive its digits-only representation at the final
transport boundary.
"""

from typing import Annotated

from pydantic import BeforeValidator


def normalize_pakistan_phone(value: object) -> str:
    """Return a Pakistan mobile number in E.164 or raise ``ValueError``.

    Blank values remain blank so schemas can choose whether a field is
    required. Common pasted/display formats are accepted, while landlines,
    short values, and double country prefixes are rejected.
    """

    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError("phone number must be text")

    raw = value.strip()
    if not raw:
        return ""

    digits = "".join(character for character in raw if character.isdigit())
    if digits.startswith("0092"):
        digits = digits[2:]
    if digits.startswith("92"):
        national = digits[2:]
    elif digits.startswith("0"):
        national = digits[1:]
    else:
        national = digits

    if len(national) != 10 or not national.startswith("3"):
        raise ValueError("enter a valid Pakistan mobile number")
    return f"+92{national}"


PakistanPhone = Annotated[str, BeforeValidator(normalize_pakistan_phone)]


def evolution_number(value: str) -> str:
    """Return the digits-only destination required by Evolution API."""

    return normalize_pakistan_phone(value).removeprefix("+")
