from __future__ import annotations

from django.db import models
from .base import UUIDModel


class GlobalConfiguration(UUIDModel):
    key = models.CharField(max_length=100, unique=True, db_index=True)
    value = models.JSONField()
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Global Configuration"
        verbose_name_plural = "Global Configurations"

    def __str__(self) -> str:
        return f"{self.key}: {self.value}"

    @classmethod
    def get_value(cls, key: str, default: any | None = None) -> any:
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    def save(self, *args, **kwargs):
        from django.core.cache import cache
        super().save(*args, **kwargs)
        # Invalidate the cache for this key
        cache_key = f"auth:config:{self.key}"
        cache.delete(cache_key)
