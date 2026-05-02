from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models.config import GlobalConfiguration
from core.models.base import UUIDModel
from core.utils import SmartUploadPath, UploadPathConfig
from django.contrib.auth.hashers import make_password, check_password
import secrets
import string


from core.utils.identity import get_deterministic_masked_email


from datetime import timedelta
from django.core.exceptions import ValidationError
from django.core.validators import validate_slug


class Client(UUIDModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    class InvitationPolicy(models.TextChoices):
        EVERYONE = "everyone", "Everyone"
        CONTACTS_ONLY = "contacts", "Contacts Only"
        REQUEST_REQUIRED = "request", "Request Required"

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
    banner_picture = models.ImageField(
        upload_to=SmartUploadPath(
            UploadPathConfig(
                base_path="banner_pictures",
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
        null=True,
    )
    phone_number = models.CharField(max_length=16, unique=True, blank=True, null=True)
    username = models.SlugField(
        max_length=30,
        unique=True,
        db_index=True,
        blank=True,
        null=True,
        validators=[validate_slug],
    )
    username_change_history = models.JSONField(default=list, blank=True)
    who_can_add_me = models.CharField(
        max_length=20,
        choices=InvitationPolicy.choices,
        default=InvitationPolicy.EVERYONE,
    )
    is_email_masked = models.BooleanField(default=False)
    masked_email = models.EmailField(unique=True, db_index=True, editable=False, blank=True, null=True)
    is_two_factor_enabled = models.BooleanField(default=False)
    totp_secret = models.CharField(max_length=255, blank=True, default="")
    backup_codes = models.JSONField(default=list, blank=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user"]),
            models.Index(fields=["full_name"]),
            models.Index(fields=["username"]),
            models.Index(fields=["masked_email"]),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.user.email})"

    def save(self, *args, **kwargs):
        # Ensure masked_email is always populated deterministically
        if not self.masked_email:
            self.masked_email = get_deterministic_masked_email(self.id)
            
        # Enforce username change limit (multi-change history)
        if self.pk:
            old_instance = Client.objects.filter(pk=self.pk).first()
            if old_instance and old_instance.username != self.username:
                now = timezone.now()
                cooldown_days = GlobalConfiguration.get_value("USERNAME_CHANGE_COOLDOWN_DAYS", 30)
                change_limit = GlobalConfiguration.get_value("USERNAME_CHANGE_LIMIT", None)
                
                if change_limit:
                    cooldown_period = timedelta(days=cooldown_days)
                    
                    # Filter history to keep only changes within the cooldown period
                    recent_changes = [
                        ts for ts in old_instance.username_change_history 
                        if timezone.datetime.fromisoformat(ts) > now - cooldown_period
                    ]
                    
                    if len(recent_changes) >= change_limit:
                        # Find when the oldest change in the window will expire
                        oldest_change = timezone.datetime.fromisoformat(recent_changes[0])
                        wait_until = oldest_change + cooldown_period
                        remaining_days = (wait_until - now).days
                        raise ValidationError(
                            f"You have reached the username change limit ({change_limit} times every {cooldown_days} days). "
                            f"Please wait {remaining_days} more days."
                        )
                    
                    # Update history with current change
                    self.username_change_history = recent_changes + [now.isoformat()]
                else:
                    # Unlimited changes allowed, but still good to keep history for auditing
                    self.username_change_history = old_instance.username_change_history + [now.isoformat()]
        elif self.username:
            # First time setting username during registration
            self.username_change_history = [timezone.now().isoformat()]

        super().save(*args, **kwargs)

    @property
    def is_suspended(self):
        """Check if the client currently has an active suspension."""
        return self.suspensions.filter(
            models.Q(status="active")
            & (models.Q(ends_at__gt=timezone.now()) | models.Q(ends_at__isnull=True))
        ).exists()

    @property
    def is_banned(self):
        """Check if the client currently has an active ban."""
        return self.ban_records.filter(
            is_active=True,
        ).exists()

    def generate_and_set_backup_codes(self) -> list[str]:
        """
        Generates 10 new backup codes, hashes them with Argon2/default hasher,
        saves the hashes to the DB, and returns the plaintext codes (for one-time display).
        """
        plain_codes = [
            "".join(secrets.choice(string.digits) for _ in range(8)) for _ in range(10)
        ]
        self.backup_codes = [make_password(code) for code in plain_codes]
        self.save(update_fields=["backup_codes"])
        return plain_codes

    def verify_and_burn_backup_code(self, code: str) -> bool:
        """
        Checks a provided plaintext code against the stored hashes.
        If a match is found, the hash is atomically removed from the DB and the function returns True.
        """
        if not self.backup_codes:
            return False

        for i, hashed_code in enumerate(self.backup_codes):
            if check_password(code, hashed_code):
                # Burn the code to prevent reuse
                self.backup_codes.pop(i)
                self.save(update_fields=["backup_codes"])
                return True

        return False
