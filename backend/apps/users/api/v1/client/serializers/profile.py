from __future__ import annotations

from rest_framework import serializers

from core.validators import auto_configure_fields, v
from users.models import Client


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
        v
        .file(max_mb=2, exts=["jpg", "jpeg", "png", "webp"])
        .optional()
        .label("Profile Picture")
    )

    gender = v.choice(Client.Gender.choices).optional().label("Gender")
    phone_number = v.string().optional().label("Phone Number")
    is_two_factor_enabled = v.boolean().access(read=True).label("2FA Status")

    def update(self, instance: Client, validated_data: dict):
        """
        Manually handle the update of the Client model instance.
        """
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
