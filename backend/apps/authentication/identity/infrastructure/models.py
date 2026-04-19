from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from core.models.base import UUIDModel, TimestampedModel
from django.conf import settings


class TokenBlacklist(UUIDModel):
    jti = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["jti", "expires_at"]),
        ]

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()


class UserWebAuthnCredential(TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="webauthn_credentials",
        on_delete=models.CASCADE,
    )
    credential_id = models.BinaryField(unique=True)
    public_key = models.BinaryField()
    sign_count = models.IntegerField(default=0)
    transports = models.JSONField(default=list)
    label = models.CharField(max_length=128, blank=True)

    class Meta:
        verbose_name = "WebAuthn Credential"
        indexes = [
            models.Index(fields=["user", "created_at"]),
        ]
