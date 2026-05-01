from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class IdentityInitSerializer(serializers.Serializer):
    """
    Validation for the initial identity discovery phase.
    """

    email = v.email().label("Email Address")


@auto_configure_fields
class IdentityChallengeSerializer(serializers.Serializer):
    """
    Validation for the credential submission phases.
    Encapsulates the HIT (Hardened Identity Token) and the selected verification method.
    """

    METHOD_CHOICES = [
        ("password", "Password"),
        ("email_otp", "Email OTP"),
        ("totp", "Authenticator App"),
        ("backup_code", "Backup Recovery"),
    ]

    hit = v.string().label("Identity Token")
    method = v.choice(METHOD_CHOICES).label("Verification Method")
    expected_step = v.integer().label("Expected Step")

    password = v.string().optional().label("Password")
    code = v.string().optional().min(6).max(6).label("Verification Code")

    def validate(self, attrs):
        method = attrs.get("method")
        if method == "password" and not attrs.get("password"):
            raise serializers.ValidationError({
                "password": "Password is required for this method."
            })
        return attrs


@auto_configure_fields
class ClientLoginSerializer(serializers.Serializer):
    """
    Serializer for client login using email/password credentials.
    """

    email = v.email().label("Email Address")
    password = v.string().min(1).label("Password")
    session_type = (
        v
        .choice([("client", "Client"), ("staff", "Staff")])
        .optional()
        .default("client")
        .label("Session Type")
    )


@auto_configure_fields
class ClientTokenRefreshSerializer(serializers.Serializer):
    """
    Serializer for the Token Rotation flow.
    """

    refresh = v.string().label("Refresh Token")


@auto_configure_fields
class ClientTokenVerifySerializer(serializers.Serializer):
    """
    Serializer to verify the integrity and validity of an Elite token.
    """

    token = v.string().label("Token")
