"""Every response — including unhandled 500s — must carry CORS headers.

Regression for the production failure mode where backend exceptions surfaced
in the browser as 'blocked by CORS policy': Starlette's outermost
ServerErrorMiddleware response bypasses CORSMiddleware, so the 500 must be
produced *inside* the middleware stack instead."""
from app.main import app as fastapi_app


@fastapi_app.get("/test/boom", include_in_schema=False)
async def _boom():
    raise RuntimeError("boom for tests")


async def test_unhandled_exception_returns_json_500_with_cors(client):
    response = await client.get("/test/boom")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "access-control-allow-origin" in response.headers


async def test_http_error_carries_cors(client):
    response = await client.get("/api/v1/academics/sessions/not-a-uuid/rollover")
    assert response.status_code in (404, 405, 422)
    assert "access-control-allow-origin" in response.headers


async def test_healthz_carries_cors(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
