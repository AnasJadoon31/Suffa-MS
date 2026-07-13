from pydantic import BaseModel, Field


class PresignUploadRequest(BaseModel):
    category: str = Field(min_length=1, max_length=64)
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = "application/octet-stream"
    # Optional: when the frontend knows the file size upfront, it can be
    # declared here and gets pinned into the presigned URL's signature
    # (OWASP A04 upload-size guardrail). Omitting it preserves the old
    # unbounded-size behaviour for callers that haven't adopted this yet.
    size_bytes: int | None = Field(default=None, ge=0)


class PresignUploadResponse(BaseModel):
    object_key: str
    upload_url: str


class PresignDownloadResponse(BaseModel):
    url: str
