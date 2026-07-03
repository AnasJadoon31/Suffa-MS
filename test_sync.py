import requests
from datetime import datetime

payload = {
    "entries": [
        {
            "subject_type": "student",
            "subject_id": "13c1cbf0-5be1-4647-bb27-5d97f3debdba",
            "session_id": "a01bc7a7-9e56-46f6-8954-8194b0c439ae",
            "attendance_date": "2026-07-04",
            "status": "present",
            "captured_at": datetime.now().isoformat() + "Z",
            "idempotency_key": f"13c1cbf0-5be1-4647-bb27-5d97f3debdba-{datetime.now().isoformat()}"
        }
    ]
}

# The user is logged in as admin with password123, madrasa "suffa"
# Let's get a token first
login = requests.post(
    "http://localhost:8000/api/v1/auth/token",
    data={"username": "admin", "password": "password123"},
    headers={"X-Madrasa": "suffa"}
)

token = login.json().get("access_token")

res = requests.post(
    "http://localhost:8000/api/v1/attendance/sync",
    json=payload,
    headers={
        "Authorization": f"Bearer {token}",
        "X-Madrasa": "suffa"
    }
)

print(res.status_code)
print(res.json())
