from __future__ import annotations

from rest_framework import serializers

from core.validators import auto_configure_fields, v


@auto_configure_fields
class ClientLoginSerializer(serializers.Serializer):
    """
    Serializer for client login using email/password credentials.
    """

    email = v.email.label("Email Address")
    password = v.string.min(1).label("Password")
