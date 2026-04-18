from __future__ import annotations

from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientTokenVerifySerializer(serializers.Serializer):
    """
    Serializer to verify the integrity and validity of an Elite token.
    Checks signature, decryption, and hardware binding.
    """

    token = v.string().label("Token")


@auto_configure_fields
class ClientTokenRefreshSerializer(serializers.Serializer):
    """
    Serializer for the Token Rotation flow.
    Requires a valid, non-blacklisted refresh token.
    """

    refresh = v.string().label("Refresh Token")
