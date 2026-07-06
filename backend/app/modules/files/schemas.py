from pydantic import BaseModel


class PresignUploadRequest(BaseModel):
    category: str
    filename: str
    content_type: str = "application/octet-stream"


class PresignUploadResponse(BaseModel):
    object_key: str
    upload_url: str


class PresignDownloadResponse(BaseModel):
    url: str
