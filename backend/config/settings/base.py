from pathlib import Path
import sys

from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "apps"))


SECRET_KEY = config("SECRET_KEY", default="django-insecure-change-me")

DEBUG = config("DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1",
    cast=lambda v: [s.strip() for s in v.split(",")],
)


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_celery_beat",
    "django_celery_results",
    "channels",
    "drf_spectacular",
    "users",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

AUTH_USER_MODEL = "users.CustomUser"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="chatapp"),
        "USER": config("DB_USER", default="postgres"),
        "PASSWORD": config("DB_PASSWORD", default="password"),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
    }
}


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "core.api.authentication.AdvancedJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "core.api.pagination.StandardResultsSetPagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "core.api.exceptions.api_exception_handler",
    "PAGE_SIZE": 20,
}

AUTH_ENGINE_SETTINGS = {
    "MAX_DEVICES_PER_USER": config("MAX_DEVICES_PER_USER", default=5, cast=int),
    "ACCESS_TOKEN_LIFETIME": config("ACCESS_TOKEN_LIFETIME", default=3600, cast=int),
    "REFRESH_TOKEN_LIFETIME": config("REFRESH_TOKEN_LIFETIME", default=86400, cast=int),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Production Chatapp API",
    "DESCRIPTION": "Advanced Authentication and Messaging Service",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}


CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000,http://127.0.0.1:3000",
    cast=lambda v: [s.strip() for s in v.split(",")],
)
CORS_ALLOW_CREDENTIALS = True

CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": config("REDIS_URL", default="redis://redis:6379/1"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [config("REDIS_URL", default="redis://redis:6379/2")],
        },
    },
}

AWS_ACCESS_KEY_ID = config("MINIO_ACCESS_KEY", default="minioadmin")
AWS_SECRET_ACCESS_KEY = config("MINIO_SECRET_KEY", default="minioadmin")
AWS_STORAGE_BUCKET_NAME = config("MINIO_BUCKET_NAME", default="chatapp")
AWS_S3_ENDPOINT_URL = config("MINIO_ENDPOINT", default="http://minio:9000")
AWS_S3_CUSTOM_DOMAIN = config("MINIO_CUSTOM_DOMAIN", default=None)
AWS_DEFAULT_ACL = None
AWS_S3_OBJECT_PARAMETERS = {
    "CacheControl": "max-age=86400",
}
AWS_LOCATION = "media"
AWS_S3_REGION_NAME = "us-east-1"
AWS_S3_SIGNATURE_VERSION = "s3v4"

DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"

KAFKA_BOOTSTRAP_SERVERS = config("KAFKA_BOOTSTRAP_SERVERS", default="localhost:9092")
KAFKA_CONSUMER_CONFIG = {
    "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
    "group.id": "chatapp-consumer-group",
    "auto.offset.reset": "earliest",
    "enable.auto.commit": True,
}
KAFKA_PRODUCER_CONFIG = {
    "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": config("DJANGO_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
        "users": {
            "handlers": ["console"],
            "level": config("USERS_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
        "core": {
            "handlers": ["console"],
            "level": config("CORE_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
    },
}


OTP_EXPIRATION_SECONDS = config("OTP_EXPIRATION_SECONDS", default=300, cast=int)
OTP_RESEND_INTERVAL_SECONDS = config(
    "OTP_RESEND_INTERVAL_SECONDS", default=60, cast=int
)

EMAIL_BACKEND = config(
    "EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = config("EMAIL_HOST", default="localhost")
EMAIL_PORT = config("EMAIL_PORT", default=1025, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=False, cast=bool)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=False, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@verify.vibe.com")

BRAND_NAME = config("BRAND_NAME", default="VIBE")
BRAND_DOMAIN = config("BRAND_DOMAIN", default="vibe.com")
BRAND_SLOGAN = config("BRAND_SLOGAN", default="A video creation & streaming platform")
SUPPORT_EMAIL = config("SUPPORT_EMAIL", default="support@vibe.com")
BRAND_ADDRESS = config(
    "BRAND_ADDRESS", default="123 Creator Avenue, Suite 400, Los Angeles, CA 90036"
)
BRAND_COLOR_PRIMARY = config("BRAND_COLOR_PRIMARY", default="#2563eb")
BRAND_COLOR_SECONDARY = config("BRAND_COLOR_SECONDARY", default="#0f172a")
