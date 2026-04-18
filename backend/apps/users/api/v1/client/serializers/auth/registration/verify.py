from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientSignUpVerifySerializer(serializers.Serializer):
    email = v.email().label("Email Address")
    otp_code = v.string().min(6).max(6).label("Verification Code")


@auto_configure_fields
class ClientSignUpVerifyResponseSerializer(serializers.Serializer):
    signup_token = v.string().label("Signup Token")
