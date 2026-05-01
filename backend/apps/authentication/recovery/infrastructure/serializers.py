from __future__ import annotations

from rest_framework import serializers

from core.validators import auto_configure_fields, v


@auto_configure_fields
class ClientPasswordResetRequestSerializer(serializers.Serializer):
    email = v.email().label("Email Address")


@auto_configure_fields
class ClientPasswordResetVerifySerializer(serializers.Serializer):
    email = v.email().label("Email Address")
    otp_code = (
        v
        .string()
        .min(6, message="Invalid verification code format.")
        .max(6)
        .label("Verification Code")
    )


@auto_configure_fields
class ClientPasswordResetConfirmSerializer(serializers.Serializer):
    reset_token = v.string().label("Reset Token")
    password = v.password().min(8).label("New Password")
    confirm_password = v.confirm_password(target="password")


@auto_configure_fields
class ClientPasswordChangeSerializer(serializers.Serializer):
    old_password = v.string().min(1).label("Current Password")
    password = v.password().min(8).label("New Password")
    confirm_password = v.confirm_password(target="password")
