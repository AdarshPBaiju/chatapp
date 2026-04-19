from __future__ import annotations

from django.db import models
from django.core.cache import cache
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
        cache_key = f"auth:config:{key}"
        cached_val = cache.get(cache_key)
        if cached_val is not None:
            return cached_val

        try:
            val = cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default
        else:
            cache.set(cache_key, val, timeout=3600)
            return val

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Invalidate the cache for this key
        cache_key = f"auth:config:{self.key}"
        cache.delete(cache_key)
