from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.core.cache import cache
from rest_framework import authentication, exceptions

from core.auth.crypto import AuthCryptoEngine

if TYPE_CHECKING:
    from users.models import CustomUser


class AdvancedJWTAuthentication(authentication.BaseAuthentication):
    """
    Elite JWT authentication backend.
    Performs multi-stage validation: signature verification, payload decryption,
    Redis-based JTI blacklist check, and hardware fingerprint binding.
    """

    def authenticate(self, request: Any) -> tuple[CustomUser, dict[str, Any]] | None:
        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ")[1]

        try:
            payload = AuthCryptoEngine.decrypt_and_verify(token)
        except ValueError as e:
            raise exceptions.AuthenticationFailed(str(e)) from e
        except Exception as e:
            msg = "Authentication protocol error"
            raise exceptions.AuthenticationFailed(msg) from e

        # Ensure we are checking the blacklist
        jti = payload.get("jti")
        if cache.get(f"auth:blacklist:{jti}"):
            msg = "This session has been revoked by the system"
            raise exceptions.AuthenticationFailed(msg)

        # Hardware Fingerprint Binding Check
        current_fpt = AuthCryptoEngine.generate_fingerprint(request)
        if payload.get("fpt") != current_fpt:
            msg = "Security breach: Token context mismatch detected"
            raise exceptions.AuthenticationFailed(msg)

        user_id = payload.get("user_id")
        from users.models import CustomUser

        try:
            user = CustomUser.objects.get(id=user_id, is_active=True)
        except CustomUser.DoesNotExist:
            msg = "Subject user no longer exists or is inactive"
            raise exceptions.AuthenticationFailed(msg) from None

        # Return (user, payload) so request.auth holds the token data
        return (user, payload)

    def authenticate_header(self, request: Any) -> str:
        """
        Returns the challenge for the WWW-Authenticate header.
        """
        # Note: 'request' is required by the DRF method signature
        _ = request
        return "Bearer"
