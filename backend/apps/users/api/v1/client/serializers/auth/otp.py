from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientGenericResendOTPSerializer(serializers.Serializer):
    """
    Generic serializer for requesting a new verification code.
    Used for MFA, restricted access, or secondary verification.
    """

    user_id = v.uuid.optional().label("User ID")
    email = v.email.optional().label("Email Address")

    def validate(self, data):
        if not data.get("user_id") and not data.get("email"):
            raise serializers.ValidationError(
                "Either user_id or email must be provided."
            )
        return data
