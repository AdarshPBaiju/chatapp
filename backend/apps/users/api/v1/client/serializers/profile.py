from __future__ import annotations

from rest_framework import serializers

from django.utils import timezone
from datetime import timedelta
from core.validators import auto_configure_fields, v
from users.models import Client
from core.models.config import GlobalConfiguration


@auto_configure_fields
class ClientProfileSerializer(serializers.Serializer):
    """
    Serializer for retrieving and updating client profile information.
    Uses the core.validators DSL for advanced validation logic.
    Decoupled from ModelSerializer to provide more explicit control.
    """

    user_id = v.uuid().source("user.id").access(read=True).label("User ID")
    email = v.email().source("user.email").access(read=True).label("Email Address")

    full_name = v.string().max(255).label("Full Name")
    bio = v.string().optional().label("Bio")

    profile_picture = (
        v.file(max_mb=2, exts=["jpg", "jpeg", "png", "webp"])
        .optional()
        .label("Profile Picture")
    )

    gender = v.choice(Client.Gender.choices).optional().label("Gender")
    phone_number = v.string().optional().label("Phone Number")
    username = v.string().min(3).max(30).optional().label("Username")
    is_email_masked = v.boolean().optional().label("Email Masking")
    masked_email = v.string().access(read=True).label("Masked Email")
    username_change_history = (
        v.list(v.datetime()).access(read=True).label("Username Change History")
    )
    username_change_limit = serializers.SerializerMethodField()
    who_can_add_me = v.choice(Client.InvitationPolicy.choices).optional().label("Who can add me")
    is_two_factor_enabled = v.boolean().access(read=True).label("2FA Status")

    def get_username_change_limit(self, obj):
        return GlobalConfiguration.get_value("USERNAME_CHANGE_LIMIT", 0)

    def validate_username(self, value):
        instance = getattr(self, "instance", None)
        if instance and instance.username != value:
            now = timezone.now()

            cooldown_days = GlobalConfiguration.get_value(
                "USERNAME_CHANGE_COOLDOWN_DAYS", 30
            )
            change_limit = GlobalConfiguration.get_value("USERNAME_CHANGE_LIMIT", None)

            if change_limit:
                cooldown_period = timedelta(days=cooldown_days)

                recent_changes = [
                    ts
                    for ts in instance.username_change_history
                    if timezone.datetime.fromisoformat(ts) > now - cooldown_period
                ]

                if len(recent_changes) >= change_limit:
                    oldest_change = timezone.datetime.fromisoformat(recent_changes[0])
                    wait_until = oldest_change + cooldown_period
                    remaining_days = (wait_until - now).days
                    raise serializers.ValidationError(
                        f"Username can only be changed {change_limit} times every {cooldown_days} days. "
                        f"Please wait {remaining_days} more days."
                    )
        return value

    def update(self, instance: Client, validated_data: dict):
        """
        Manually handle the update of the Client model instance.
        """
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
