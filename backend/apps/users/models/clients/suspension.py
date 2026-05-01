from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from users.exceptions import InactiveSuspensionError
from core.models.base import UUIDModel


class ClientAccountSuspension(UUIDModel):
    """
    Advanced suspension model with reason choices, status tracking,
    audit fields, and business logic methods.
    """

    class SuspensionReason(models.TextChoices):
        POLICY_VIOLATION = "policy_violation", "Policy Violation"
        ABUSIVE_BEHAVIOR = "abusive_behavior", "Abusive Behavior"
        SPAM = "spam", "Spam"
        FRAUD = "fraud", "Fraud"
        PAYMENT_ISSUE = "payment_issue", "Payment Issue"
        UNDER_REVIEW = "under_review", "Under Review"
        OTHER = "other", "Other"

    class SuspensionStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        LIFTED = "lifted", "Lifted"

    client = models.ForeignKey(
        "users.Client",
        on_delete=models.CASCADE,
        related_name="suspensions",
        db_index=True,
        help_text="The client being suspended.",
    )

    reason = models.CharField(
        max_length=50,
        choices=SuspensionReason.choices,
        default=SuspensionReason.OTHER,
        help_text="Primary reason for the suspension.",
    )
    details = models.TextField(
        blank=True,
        help_text="Additional context or notes about the suspension.",
    )

    suspended_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the suspension was created.",
    )
    ends_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the suspension automatically expires. Leave blank for indefinite.",
    )

    status = models.CharField(
        max_length=20,
        choices=SuspensionStatus.choices,
        default=SuspensionStatus.ACTIVE,
        db_index=True,
        help_text="Current state of the suspension. Managed automatically.",
    )

    suspended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suspensions_issued",
        help_text="Staff member who applied the suspension.",
    )
    lifted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suspensions_lifted",
        help_text="Staff member who manually lifted the suspension.",
    )
    lifted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the suspension was manually lifted.",
    )
    lift_reason = models.TextField(
        blank=True,
        help_text="Reason for lifting the suspension early.",
    )

    class Meta:
        ordering: ClassVar[list[str]] = ["-suspended_at"]
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["client", "status"]),
            models.Index(fields=["status", "ends_at"]),
            models.Index(fields=["suspended_by"]),
        ]
        verbose_name = "Account Suspension"
        verbose_name_plural = "Account Suspensions"

    def __str__(self):
        return f"Suspension #{self.id} - {self.client.full_name} ({self.get_status_display()})"

    @property
    def is_active(self) -> bool:
        """
        Returns True if the suspension is currently in effect.
        Combines status check with temporal validity.
        """
        if self.status != self.SuspensionStatus.ACTIVE:
            return False
        return not (self.ends_at and self.ends_at <= timezone.now())

    def lift(self, lifted_by=None, reason: str = "") -> None:
        """
        Manually lift (revoke) an active suspension before its end date.
        """
        if not self.is_active:
            raise InactiveSuspensionError(
                _("Cannot lift a suspension that is not active.")
            )

        self.status = self.SuspensionStatus.LIFTED
        self.lifted_by = lifted_by
        self.lifted_at = timezone.now()
        self.lift_reason = reason
        self.save(update_fields=["status", "lifted_by", "lifted_at", "lift_reason"])

    def extend(self, new_end_date, extended_by=None, reason: str = "") -> None:
        """
        Extend an active suspension to a later date.
        Creates a note in the details field (optional audit trail).
        """
        if not self.is_active:
            raise InactiveSuspensionError(
                _("Cannot extend a suspension that is not active.")
            )

        old_ends_at = self.ends_at
        self.ends_at = new_end_date
        extension_note = (
            f"\n[Extended on {timezone.now().date()}] "
            f"From {old_ends_at} to {new_end_date}. "
            f"By: {extended_by}. Reason: {reason}"
        )
        self.details = (self.details or "") + extension_note
        self.save(update_fields=["ends_at", "details"])

    def save(self, *args, **kwargs):
        """
        Override save to set a default suspension length if none provided.
        """
        if not self.ends_at and self.status == self.SuspensionStatus.ACTIVE:
            self.ends_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)
