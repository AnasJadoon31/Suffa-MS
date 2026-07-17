from pydantic import BaseModel, Field


class PresignUploadRequest(BaseModel):
    category: str = Field(min_length=1, max_length=64)
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = "application/octet-stream"
    # Required so every presigned URL is bounded by the configured upload cap.
    size_bytes: int = Field(ge=0)


class PresignUploadResponse(BaseModel):
    object_key: str
    upload_url: str


class PresignDownloadResponse(BaseModel):
    url: str
