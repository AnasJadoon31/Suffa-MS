from uuid import uuid4

import pytest

from app.core.storage import UploadRejected, assert_upload_allowed


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


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("lesson.pdf", "application/pdf"),
        ("letter.doc", "application/msword"),
        ("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("sheet.xls", "application/vnd.ms-excel"),
        ("notes.md", "text/markdown"),
        ("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("slides.ppt", "application/vnd.ms-powerpoint"),
        ("slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("notes.odt", "application/vnd.oasis.opendocument.text"),
        ("budget.ods", "application/vnd.oasis.opendocument.spreadsheet"),
        ("slides.odp", "application/vnd.oasis.opendocument.presentation"),
        ("readme.txt", "text/plain"),
        ("data.csv", "text/csv"),
        ("rich.rtf", "application/rtf"),
    ],
)
def test_document_upload_policy_allows_supported_family(filename, content_type):
    assert_upload_allowed(content_type, 128, filename=filename, category="submissions")


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("script.js", "text/plain"),
        ("page.html", "text/plain"),
        ("disguised.pdf", "text/plain"),
        ("archive.zip", "application/pdf"),
    ],
)
def test_document_upload_policy_rejects_unsafe_or_disguised_files(filename, content_type):
    with pytest.raises(UploadRejected):
        assert_upload_allowed(content_type, 128, filename=filename, category="resources")
