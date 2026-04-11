from rest_framework import serializers
from core.validators import v, auto_configure_fields
from users.models import CustomUser


@auto_configure_fields
class ClientSignUpSerializer(serializers.Serializer):
    """
    Standardized onboarding serializer for new clients.
    Defined as a plain Serializer to maintain strict control over the input schema
    while utilizing the high-performance 'v' DSL for validation.
    """

    full_name = v.string.min(3).label("Full Name")
    email = v.email.unique(CustomUser).label("Email Address")
    password = v.password.min(8).label("Password")
    confirm_password = v.confirm_password().label("Confirm Password")


@auto_configure_fields
class ClientOTPValidationSerializer(serializers.Serializer):
    """
    Serializer for verifying the 6-digit email confirmation code.
    """

    user_id = v.uuid.label("User ID")
    otp_code = v.string.min(6).max(6).label("Verification Code")


@auto_configure_fields
class ClientResendOTPSerializer(serializers.Serializer):
    """
    Serializer for requesting a new verification code.
    Verified by the primary user_id.
    """

    user_id = v.uuid.label("User ID")


@auto_configure_fields
class ClientSessionRevokeSerializer(serializers.Serializer):
    """
    Serializer to revoke a specific remote session.
    Requires the access JTI of the session to target.
    """

    access_jti = v.string.label("Access JTI")


@auto_configure_fields
class ClientTokenVerifySerializer(serializers.Serializer):
    """
    Serializer to verify the integrity and validity of an Elite token.
    Checks signature, decryption, and hardware binding.
    """

    token = v.string.label("Token")
