from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.core.storage import (
    StorageNotConfigured,
    UploadRejected,
    assert_upload_allowed,
    build_object_key,
    presign_download_url,
    presign_upload_url,
)
from app.modules.auth.models import User
from app.modules.files.schemas import PresignDownloadResponse, PresignUploadRequest, PresignUploadResponse

router = APIRouter()


@router.post("/presign-upload", response_model=PresignUploadResponse)
async def presign_upload(
    payload: PresignUploadRequest,
    current_user: User = Depends(get_current_user),
) -> PresignUploadResponse:
    try:
        assert_upload_allowed(payload.content_type, payload.size_bytes)
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    object_key = build_object_key(payload.category, payload.filename)
    try:
        url = presign_upload_url(object_key, payload.content_type, size_bytes=payload.size_bytes)
    except StorageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PresignUploadResponse(object_key=object_key, upload_url=url)


@router.get("/presign-download", response_model=PresignDownloadResponse)
async def presign_download(
    object_key: str,
    current_user: User = Depends(get_current_user),
) -> PresignDownloadResponse:
    try:
        url = presign_download_url(object_key)
    except StorageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PresignDownloadResponse(url=url)
