import uuid

import boto3
from botocore.client import Config

from app.core.config import settings


class StorageNotConfigured(RuntimeError):
    pass


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


def build_object_key(category: str, filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    return f"{category}/{uuid.uuid4().hex}.{suffix}"


def presign_upload_url(object_key: str, content_type: str, expires_in: int = 900) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def presign_download_url(object_key: str, expires_in: int = 900) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key},
        ExpiresIn=expires_in,
    )
