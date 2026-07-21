from datetime import datetime, UTC
from app.core.hijri import to_hijri_string

print(to_hijri_string(datetime.now(UTC).date()))
