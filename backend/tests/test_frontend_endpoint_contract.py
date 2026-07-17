"""Keep the PWA API client aligned with FastAPI's registered routes."""

import re
import inspect
from pathlib import Path

from app.main import app


FRONTEND_SRC = Path(__file__).parents[2] / "app" / "src"


def _registered_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        if not route.path.startswith("/api/v1") or not hasattr(route, "methods"):
            continue
        for method in route.methods - {"HEAD", "OPTIONS"}:
            routes.add((method.lower(), route.path))
    return routes


def _client_calls() -> set[tuple[str, str]]:
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in FRONTEND_SRC.rglob("*")
        if path.suffix in {".ts", ".tsx"}
    )
    calls: set[tuple[str, str]] = set()

    api_call = re.compile(
        r"api\.(get|post|put|patch|delete)(?:<[^;()]{0,300}?>)?\(\s*([`\"])(/api/v1/.*?)\2",
        re.DOTALL,
    )
    for match in api_call.finditer(source):
        calls.add((match.group(1), match.group(3)))

    get_helper = re.compile(
        r"(?:getAllPages|getPage|downloadReport)(?:<[^;()]{0,300}?>)?\(\s*([`\"])(/api/v1/.*?)\1",
        re.DOTALL,
    )
    for match in get_helper.finditer(source):
        calls.add(("get", match.group(2)))
    return calls


def _same_route(client_path: str, server_path: str) -> bool:
    client_parts = client_path.split("/")
    server_parts = server_path.split("/")
    if len(client_parts) != len(server_parts):
        return False
    return all(
        client == server
        or (client.startswith("${") and client.endswith("}") and server.startswith("{") and server.endswith("}"))
        for client, server in zip(client_parts, server_parts, strict=True)
    )


def test_every_frontend_api_call_has_a_registered_backend_route():
    registered = _registered_routes()
    missing = sorted(
        (method, path)
        for method, path in _client_calls()
        if not any(method == server_method and _same_route(path, server_path) for server_method, server_path in registered)
    )
    assert not missing, "Frontend calls missing FastAPI routes:\n" + "\n".join(
        f"{method.upper()} {path}" for method, path in missing
    )


def test_every_get_list_endpoint_declares_pagination_contract():
    missing = []
    for route in app.routes:
        if "GET" not in getattr(route, "methods", set()):
            continue
        if getattr(getattr(route, "response_model", None), "__origin__", None) is not list:
            continue
        parameters = inspect.signature(route.endpoint).parameters
        if not {"response", "limit", "offset"}.issubset(parameters):
            missing.append(route.path)
    assert not missing, "Unpaginated GET list endpoints:\n" + "\n".join(sorted(missing))
