from uuid import uuid4


async def test_upload_requires_a_declared_file_size(client):
    response = await client.post(
        "/api/v1/files/presign-upload",
        json={"category": "resources", "filename": "lesson.pdf", "content_type": "application/pdf"},
    )

    assert response.status_code == 422


async def test_upload_key_is_scoped_to_the_active_madrasa(client, seed, monkeypatch):
    monkeypatch.setattr(
        "app.modules.files.routes.presign_upload_url",
        lambda object_key, content_type, size_bytes: "https://storage.example/upload",
    )

    response = await client.post(
        "/api/v1/files/presign-upload",
        json={
            "category": "resources",
            "filename": "lesson.pdf",
            "content_type": "application/pdf",
            "size_bytes": 128,
        },
    )

    assert response.status_code == 200
    assert response.json()["object_key"].startswith(f"madrasas/{seed.madrasa.id}/resources/")


async def test_download_rejects_another_madrasas_object_key(client, monkeypatch):
    storage_called = False

    def fake_presign(_object_key: str) -> str:
        nonlocal storage_called
        storage_called = True
        return "https://storage.example/download"

    monkeypatch.setattr("app.modules.files.routes.presign_download_url", fake_presign)
    response = await client.get(
        "/api/v1/files/presign-download",
        params={"object_key": f"madrasas/{uuid4()}/resources/lesson.pdf"},
    )

    assert response.status_code == 403
    assert storage_called is False
