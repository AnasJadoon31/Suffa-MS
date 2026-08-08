"""Typed per-madrasa settings catalogue (IMPLEMENT.md §7).

Storage stays the MadrasaSetting key/value table, but only keys defined here
are accepted, each with a type and category — this is what turns the raw
key/value editor into a real settings page. Feature flags deliberately live
elsewhere (madrasa_features, super-admin only).
"""
from dataclasses import dataclass


DEFAULT_EVOLUTION_WEBHOOK_EVENTS = (
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
)


@dataclass(frozen=True)
class SettingDef:
    key: str
    category: str
    type: str  # string | int | bool | file | secret
    default: str
    label: str


CATALOG: tuple[SettingDef, ...] = (
    # Madrasa profile — visible to every member of the madrasa.
    SettingDef("madrasa.name_en", "profile", "string", "", "Name (English)"),
    SettingDef("madrasa.name_ur", "profile", "string", "", "Name (Urdu)"),
    SettingDef("madrasa.address", "profile", "string", "", "Address"),
    SettingDef("madrasa.phone", "profile", "string", "", "Phone number"),
    SettingDef("madrasa.email", "profile", "string", "", "Email address"),
    SettingDef("madrasa.website", "profile", "string", "", "Website"),
    SettingDef("madrasa.logo_file_id", "profile", "file", "", "Logo"),
    SettingDef("regional.timezone", "profile", "string", "Asia/Karachi", "Timezone"),
    # Security.
    SettingDef("security.idle_timeout_minutes_principal", "security", "int", "60", "Idle timeout — principal (minutes)"),
    SettingDef("security.idle_timeout_minutes_teacher", "security", "int", "60", "Idle timeout — teacher (minutes)"),
    SettingDef("security.idle_timeout_minutes_student", "security", "int", "30", "Idle timeout — student (minutes)"),
    # Academics.
    SettingDef("academics.show_hijri_dates", "academics", "bool", "true", "Show Hijri dates"),
    # Attendance.
    SettingDef("attendance.lock_time", "attendance", "string", "23:59", "Attendance lock time"),
    # Finance.
    SettingDef("finance.currency", "finance", "string", "PKR", "Currency"),
    SettingDef("finance.receipt_footer", "finance", "string", "", "Receipt footer text"),
    # Portal.
    SettingDef("portal.default_language", "portal", "string", "ur", "Default language"),
    # WhatsApp / Evolution API v2.
    SettingDef("whatsapp.evolution_api_url", "whatsapp", "string", "", "Evolution API URL"),
    SettingDef("whatsapp.evolution_api_key", "whatsapp", "secret", "", "Evolution API key"),
    SettingDef("whatsapp.evolution_instance", "whatsapp", "string", "", "Evolution instance name"),
    SettingDef("whatsapp.evolution_webhook_url", "whatsapp", "string", "", "Evolution webhook URL"),
    SettingDef("whatsapp.evolution_webhook_base64", "whatsapp", "bool", "true", "Receive media as base64"),
    SettingDef(
        "whatsapp.evolution_webhook_events",
        "whatsapp",
        "string",
        ",".join(DEFAULT_EVOLUTION_WEBHOOK_EVENTS),
        "Webhook events",
    ),
)

CATALOG_BY_KEY: dict[str, SettingDef] = {item.key: item for item in CATALOG}


def validate_setting(key: str, value: str) -> None:
    """Raises ValueError for unknown keys or type-invalid values."""
    definition = CATALOG_BY_KEY.get(key)
    if definition is None:
        raise ValueError(f"Unknown setting: {key}")
    if definition.type == "int":
        try:
            int(value)
        except ValueError:
            raise ValueError(f"Setting {key} must be an integer")
    elif definition.type == "bool":
        if value not in ("true", "false"):
            raise ValueError(f"Setting {key} must be 'true' or 'false'")
    elif definition.type == "secret":
        if "\n" in value or "\r" in value:
            raise ValueError(f"Setting {key} must be a single line")
