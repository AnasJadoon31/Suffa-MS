import re
import uuid

import boto3
from botocore.client import Config

from app.core.config import settings

# OWASP A04 (insecure design) / A08 (software & data integrity): keep the S3
# key namespace predictable — no path traversal via a crafted category or
# filename, and only a short known-safe extension charset.
_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9_-]+")
_SAFE_EXTENSION = re.compile(r"^[a-zA-Z0-9]{1,10}$")
DOCUMENT_UPLOAD_CATEGORIES = {"assignments", "resources", "submissions"}
DOCUMENT_MIME_BY_EXTENSION: dict[str, set[str]] = {
    "pdf": {"application/pdf"},
    "doc": {"application/msword"},
    "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "xls": {"application/vnd.ms-excel"},
    "xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    "ppt": {"application/vnd.ms-powerpoint"},
    "pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    "odt": {"application/vnd.oasis.opendocument.text"},
    "ods": {"application/vnd.oasis.opendocument.spreadsheet"},
    "odp": {"application/vnd.oasis.opendocument.presentation"},
    "txt": {"text/plain"},
    "csv": {"text/csv", "application/csv"},
    "rtf": {"application/rtf", "text/rtf"},
    "md": {"text/markdown", "text/plain"},
}


class StorageNotConfigured(RuntimeError):
    pass


class UploadRejected(ValueError):
    """Raised when the requested content-type/size/category fails policy."""


def _client():
    if not (settings.s3_endpoint and settings.s3_access_key and settings.s3_secret_key):
        raise StorageNotConfigured("Object storage is not configured (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY)")
    endpoint = settings.s3_public_url or settings.s3_endpoint
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
    )


def build_object_key(madrasa_id: uuid.UUID, category: str, filename: str) -> str:
    safe_category = _SAFE_SEGMENT.sub("-", category).strip("-") or "misc"
    raw_suffix = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    suffix = raw_suffix.lower() if _SAFE_EXTENSION.match(raw_suffix) else "bin"
    return f"madrasas/{madrasa_id}/{safe_category}/{uuid.uuid4().hex}.{suffix}"


def object_key_belongs_to_madrasa(object_key: str, madrasa_id: uuid.UUID) -> bool:
    """Return whether an object key is inside this tenant's exact namespace."""
    return object_key.startswith(f"madrasas/{madrasa_id}/")


def assert_upload_allowed(
    content_type: str,
    size_bytes: int,
    *,
    filename: str = "",
    category: str = "",
) -> None:
    """Validates the declared content-type/size against the configured
    allowlist/cap before a presigned URL is minted (OWASP A04/A08)."""
    if content_type not in settings.upload_allowed_content_types:
        raise UploadRejected(f"Content type '{content_type}' is not allowed for upload")
    if size_bytes > settings.upload_max_size_bytes:
        raise UploadRejected(
            f"File exceeds the maximum allowed size of {settings.upload_max_size_bytes} bytes"
        )
    if category in DOCUMENT_UPLOAD_CATEGORIES:
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        expected_mimes = DOCUMENT_MIME_BY_EXTENSION.get(extension)
        if expected_mimes is None:
            raise UploadRejected(f"File extension '.{extension or 'none'}' is not an allowed document type")
        if content_type not in expected_mimes:
            raise UploadRejected(
                f"Declared content type '{content_type}' does not match '.{extension}'"
            )


def presign_upload_url(
    object_key: str,
    content_type: str,
    size_bytes: int,
    expires_in: int = 900,
) -> str:
    params = {"Bucket": settings.s3_bucket, "Key": object_key, "ContentType": content_type}
    # Pins the signature to this exact Content-Length; the client's PUT must
    # send a matching value or S3 rejects the request.
    params["ContentLength"] = size_bytes
    return _client().generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=expires_in,
    )


def presign_download_url(object_key: str, expires_in: int = 900) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key},
        ExpiresIn=expires_in,
    )


def download_object_bytes(object_key: str) -> bytes:
    response = _client().get_object(Bucket=settings.s3_bucket, Key=object_key)
    return response["Body"].read()
