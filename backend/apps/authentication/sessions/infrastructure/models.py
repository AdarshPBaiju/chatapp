from __future__ import annotations

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models.base import UUIDModel


class AuthSession(UUIDModel):
    class SessionType(models.TextChoices):
        CLIENT = "client", "Client"
        STAFF = "staff", "Staff"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_sessions",
        db_index=True,
    )
    session_type = models.CharField(
        max_length=20,
        choices=SessionType.choices,
        default=SessionType.CLIENT,
        db_index=True,
    )
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    access_jti = models.CharField(max_length=64, db_index=True)
    refresh_jti = models.CharField(max_length=64, unique=True, db_index=True)
    fingerprint = models.CharField(max_length=64, db_index=True)
    device_label = models.CharField(max_length=255)
    device_entropy = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(db_index=True)

    # Geographic Context
    city = models.CharField(max_length=100, blank=True, default="")
    country_code = models.CharField(max_length=10, blank=True, default="")
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["user", "expires_at"]),
            models.Index(fields=["session_id", "user"]),
            models.Index(fields=["access_jti", "user"]),
        ]

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()
