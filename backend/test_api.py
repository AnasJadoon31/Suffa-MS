import asyncio
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

response = client.get("/api/v1/assessments/results/card?student_id=00000000-0000-0000-0000-000000000000&session_id=00000000-0000-0000-0000-000000000000&format=pdf")
print(response.status_code)
print(response.json())
