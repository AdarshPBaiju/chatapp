from __future__ import annotations

from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientSessionRevokeSerializer(serializers.Serializer):
    """
    Serializer to revoke a specific remote session.
    Requires the access JTI of the session to target.
    """

    session_id = v.uuid().optional().label("Session ID")
    access_jti = v.string().optional().label("Access JTI")

    def validate(self, attrs):
        if not attrs.get("session_id") and not attrs.get("access_jti"):
            raise serializers.ValidationError({
                "detail": "Either session_id or access_jti is required."
            })
        return attrs
