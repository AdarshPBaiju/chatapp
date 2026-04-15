from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields

@auto_configure_fields
class ClientRegistrationResendSerializer(serializers.Serializer):
    """
    Serializer for resending a registration verification code.
    Since account creation is delayed, this only identifies by email.
    """
    email = v.email.label("Email Address")
