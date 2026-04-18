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

        if method in {"email_otp", "totp"} and not attrs.get("code"):

            pass

        return attrs
