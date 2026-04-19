from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from core.models.base import UUIDModel


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
