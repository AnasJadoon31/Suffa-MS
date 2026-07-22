import json

import httpx

from app.core.config import settings


def _use_evolution_transport(monkeypatch, handler) -> None:
    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )
    monkeypatch.setattr(settings, "evolution_api_url", "https://evolution.test")
    monkeypatch.setattr(settings, "evolution_api_key", "secret-test-key")
    monkeypatch.setattr(settings, "evolution_instance", "suffa-ms")
    monkeypatch.setattr(settings, "evolution_tenant_slug", "test")


async def test_principal_can_read_whatsapp_connection_status(client, monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/instance/connectionState/suffa-ms"
        assert request.headers["apikey"] == "secret-test-key"
        return httpx.Response(
            200,
            request=request,
            json={"instance": {"instanceName": "suffa-ms", "state": "connecting"}},
        )

    _use_evolution_transport(monkeypatch, handler)

    response = await client.get("/api/v1/messaging/whatsapp/connection")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "instance_name": "suffa-ms",
        "state": "connecting",
        "connected": False,
    }


async def test_principal_can_replace_disconnected_instance_with_phone_pairing(
    client, monkeypatch,
):
    requests: list[tuple[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        if request.method == "GET":
            if request.url.path == "/webhook/find/suffa-ms":
                return httpx.Response(200, request=request, json=None)
            if request.url.path == "/instance/connect/suffa-ms":
                return httpx.Response(200, request=request, json={"count": 1})
            return httpx.Response(
                200,
                request=request,
                json={"instance": {"instanceName": "suffa-ms", "state": "connecting"}},
            )
        if request.method == "DELETE":
            return httpx.Response(200, request=request, json={"status": "SUCCESS"})

        body = json.loads(request.content)
        assert body == {
            "instanceName": "suffa-ms",
            "integration": "WHATSAPP-BAILEYS",
            "qrcode": True,
            "number": "923001234567",
        }
        return httpx.Response(
            201,
            request=request,
            json={
                "instance": {"instanceName": "suffa-ms", "connectionStatus": "connecting"},
                "qrcode": {"pairingCode": "ABCD1234", "base64": "must-not-leak"},
            },
        )

    _use_evolution_transport(monkeypatch, handler)

    response = await client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "+92 300 123 4567", "replace_existing": True},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "instance_name": "suffa-ms",
        "state": "connecting",
        "pairing_code": "ABCD-1234",
    }
    assert requests == [
        ("GET", "/instance/connectionState/suffa-ms"),
        ("GET", "/instance/connect/suffa-ms"),
        ("GET", "/webhook/find/suffa-ms"),
        ("DELETE", "/instance/delete/suffa-ms"),
        ("POST", "/instance/create"),
    ]


async def test_closed_whatsapp_instance_reconnects_without_deletion(client, monkeypatch):
    requests: list[tuple[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"state": "close"}})
        assert request.url.params["number"] == "923001234567"
        return httpx.Response(200, request=request, json={"pairingCode": "12345678"})

    _use_evolution_transport(monkeypatch, handler)
    response = await client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "923001234567"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["pairing_code"] == "1234-5678"
    assert requests == [
        ("GET", "/instance/connectionState/suffa-ms"),
        ("GET", "/instance/connect/suffa-ms"),
    ]


async def test_repeated_pairing_request_reuses_existing_code(client, monkeypatch):
    requests: list[tuple[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"state": "connecting"}})
        return httpx.Response(200, request=request, json={"pairingCode": "WXYZ9876"})

    _use_evolution_transport(monkeypatch, handler)
    response = await client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "923001234567", "replace_existing": True},
    )

    assert response.status_code == 200, response.text
    assert response.json()["pairing_code"] == "WXYZ-9876"
    assert requests == [
        ("GET", "/instance/connectionState/suffa-ms"),
        ("GET", "/instance/connect/suffa-ms"),
    ]


async def test_switching_incomplete_qr_pairing_requires_explicit_replacement(
    client, monkeypatch,
):
    requests: list[tuple[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        if request.url.path == "/instance/connectionState/suffa-ms":
            return httpx.Response(200, request=request, json={"instance": {"state": "connecting"}})
        return httpx.Response(200, request=request, json={"count": 1})

    _use_evolution_transport(monkeypatch, handler)
    response = await client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "923001234567"},
    )

    assert response.status_code == 428
    assert response.json()["detail"] == "whatsapp_pairing_replace_required"
    assert requests == [
        ("GET", "/instance/connectionState/suffa-ms"),
        ("GET", "/instance/connect/suffa-ms"),
    ]


async def test_whatsapp_pairing_rejects_invalid_phone_number(client, monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Evolution must not be called for an invalid phone number")

    _use_evolution_transport(monkeypatch, handler)
    response = await client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "123"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "whatsapp_phone_invalid"


async def test_other_tenant_cannot_control_configured_whatsapp_instance(client, monkeypatch):
    monkeypatch.setattr(settings, "evolution_tenant_slug", "another-madrasa")
    response = await client.get("/api/v1/messaging/whatsapp/connection")

    assert response.status_code == 403


async def test_teacher_cannot_start_whatsapp_phone_pairing(teacher_client):
    response = await teacher_client.post(
        "/api/v1/messaging/whatsapp/connection/pairing-code",
        json={"phone_number": "923001234567"},
    )

    assert response.status_code == 403
