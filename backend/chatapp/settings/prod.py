from .base import *

DEBUG = False
ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="yourdomain.com",
    cast=lambda v: [s.strip() for s in v.split(",")],
)

SECRET_KEY = config("SECRET_KEY")

DATABASES["default"].update(
    {
        "NAME": config("POSTGRES_DB"),
        "USER": config("POSTGRES_USER"),
        "PASSWORD": config("POSTGRES_PASSWORD"),
        "HOST": "db",
        "PORT": "5432",
    }
)

CACHES["default"]["LOCATION"] = "redis://redis:6379/1"

CELERY_BROKER_URL = "redis://redis:6379/0"
CELERY_RESULT_BACKEND = "redis://redis:6379/0"

AWS_ACCESS_KEY_ID = config("MINIO_ACCESS_KEY")
AWS_SECRET_ACCESS_KEY = config("MINIO_SECRET_KEY")
AWS_S3_ENDPOINT_URL = config("MINIO_ENDPOINT", default="http://minio:9000")

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="https://yourdomain.com",
    cast=lambda v: [s.strip() for s in v.split(",")],
)

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOGGING = LOGGING.copy()
LOGGING["handlers"]["file"] = {
    "level": "ERROR",
    "class": "logging.FileHandler",
    "filename": "/app/logs/django.log",
}
LOGGING["root"]["handlers"] = LOGGING["root"]["handlers"] + ["file"]
