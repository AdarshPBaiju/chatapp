from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class TwoFactorVerifySerializer(serializers.Serializer):
    code = v.string().min(6).max(6).label("Verification Code")

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Code must be numeric.")
        return value


@auto_configure_fields
class TwoFactorRecoverySerializer(serializers.Serializer):
    password = v.string().label("Password")


@auto_configure_fields
class ClientGenericResendOTPSerializer(serializers.Serializer):
    """
    Generic serializer for requesting a new verification code.
    """

    user_id = v.uuid().optional().label("User ID")
    email = v.email().optional().label("Email Address")

    def validate(self, data):
        if not data.get("user_id") and not data.get("email"):
            raise serializers.ValidationError(
                "Either user_id or email must be provided."
            )
        return data


@auto_configure_fields
class ClientGenericVerifyOTPSerializer(serializers.Serializer):
    user_id = v.uuid().label("User ID")
    otp_code = v.string().min(6).max(6).label("Verification Code")
