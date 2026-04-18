
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models.base import UUIDModel
from core.utils import SmartUploadPath, UploadPathConfig


class Client(UUIDModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="client",
        db_index=True,
    )
    full_name = models.CharField(max_length=255)
    bio = models.TextField(blank=True)
    profile_picture = models.ImageField(
        upload_to=SmartUploadPath(
            UploadPathConfig(
                base_path="profile_pictures",
                field_lookup="user.id",
                filename_mode="prepend_uuid",
            )
        ),
        blank=True,
    )
    gender = models.CharField(
        max_length=10,
        choices=Gender.choices,
        blank=True,
    )
    phone_number = models.CharField(max_length=16, unique=True, blank=True, null=True)
    is_two_factor_enabled = models.BooleanField(default=False)
    totp_secret = models.CharField(max_length=255, blank=True, default="")
    backup_codes = models.JSONField(default=list, blank=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user"]),
            models.Index(fields=["full_name"]),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.user.email})"

    @property
    def is_suspended(self):
        """Check if the client currently has an active suspension."""
        return self.suspensions.filter(
            status="active",
            ends_at__gt=timezone.now()
            if self.suspensions.filter(ends_at__isnull=False)
            else True,
        ).exists()

    @property
    def is_banned(self):
        """Check if the client currently has an active ban."""
        return self.ban_records.filter(
            is_active=True,
        ).exists()
