from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields

@auto_configure_fields
class ClientSignUpRequestSerializer(serializers.Serializer):
    email = v.email.label("Email Address")

@auto_configure_fields
class ClientSignUpRequestResponseSerializer(serializers.Serializer):
    email = v.email.label("Email Address")
    resend_interval = serializers.IntegerField(label="Resend Interval Seconds")
