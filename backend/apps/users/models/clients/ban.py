from typing import ClassVar

from django.db import models
from django.utils import timezone

from core.models.base import UUIDModel


class ClientBanRecord(UUIDModel):
    class BanReason(models.TextChoices):
        SPAM = "spam", "Spam"
        ABUSE = "abuse", "Abuse"
        OTHER = "other", "Other"

    class BanType(models.TextChoices):
        PERMANENT = "permanent", "Permanent"
        TEMPORARY = "temporary", "Temporary"

    client = models.ForeignKey(
        "users.Client",
        on_delete=models.CASCADE,
        related_name="ban_records",
        db_index=True,
    )
    reason_to_ban = models.TextField()
    reason_to_unban = models.TextField(blank=True)
    banned_at = models.DateTimeField(auto_now_add=True)
    end_at = models.DateTimeField(null=True, blank=True)
    ban_type = models.CharField(
        max_length=20,
        choices=BanType.choices,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        app_label = "users"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["client"]),
            models.Index(fields=["is_active", "ban_type", "end_at"]),
        ]

    def __str__(self):
        return f"Ban: {self.client.full_name} ({self.get_ban_type_display()})"

    @property
    def current_status(self):
        """
        Computed ban status - never stale.
        Possible return values: 'active', 'expired', 'revoked'
        """
        if not self.is_active:
            return "revoked"
        if self.ban_type == self.BanType.PERMANENT:
            return "active"
        if self.end_at and self.end_at <= timezone.now():
            return "expired"
        return "active"

    def revoke(self, reason: str = ""):
        """Manually revoke an active ban."""
        self.is_active = False
        self.reason_to_unban = reason
        self.save(update_fields=["is_active", "reason_to_unban"])
