from __future__ import annotations

from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientSessionRevokeSerializer(serializers.Serializer):
    """
    Serializer to revoke a specific remote session.
    Requires the access JTI of the session to target.
    """

    access_jti = v.string.label("Access JTI")
