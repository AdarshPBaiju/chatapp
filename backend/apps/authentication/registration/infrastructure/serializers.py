from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientSignUpRequestSerializer(serializers.Serializer):
    email = v.email().label("Email Address")


@auto_configure_fields
class ClientSignUpRequestResponseSerializer(serializers.Serializer):
    email = v.email().label("Email Address")
    resend_interval = v.integer().label("Resend Interval Seconds")


@auto_configure_fields
class ClientSignUpVerifySerializer(serializers.Serializer):
    email = v.email().label("Email Address")
    otp_code = v.string().label("Verification Code")


@auto_configure_fields
class ClientSignUpVerifyResponseSerializer(serializers.Serializer):
    signup_token = v.string().label("Signup Token")


@auto_configure_fields
class ClientSignUpFinalizeSerializer(serializers.Serializer):
    signup_token = v.string().label("Signup Token")
    full_name = v.string().label("Full Name")
    username = v.string().label("Username")
    password = v.string().label("Password")


@auto_configure_fields
class ClientRegistrationResendSerializer(serializers.Serializer):
    email = v.email().label("Email Address")
