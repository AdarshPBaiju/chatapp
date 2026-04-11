from typing import ClassVar

from django.db import models

from core.models.base import UUIDModel


class ClientDevice(UUIDModel):
    client = models.ForeignKey(
        "users.Client",
        on_delete=models.CASCADE,
        related_name="devices",
        db_index=True,
    )
    device_id = models.CharField(max_length=255, db_index=True)
    device_type = models.CharField(max_length=50)
    device_name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True, db_index=True)
    last_used_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["client", "device_id"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.device_name} ({self.client.full_name})"
