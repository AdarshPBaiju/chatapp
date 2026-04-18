from storages.backends.s3boto3 import S3Boto3Storage
from django.conf import settings


class PublicMinioStorage(S3Boto3Storage):
    """
    Custom S3 storage backend for MinIO that distinguishes between
    internal (Docker) and external (Browser) endpoints.
    """

    def url(self, name, parameters=None, expire=None, http_method=None):
        url = super().url(name, parameters, expire, http_method)

        internal_url = getattr(settings, "MINIO_INTERNAL_URL", None)
        external_url = getattr(settings, "MINIO_EXTERNAL_URL", None)

        if internal_url and external_url:
            url = url.replace(internal_url.rstrip("/"), external_url.rstrip("/"))

        return url
