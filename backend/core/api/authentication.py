from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rest_framework import authentication, exceptions

from core.auth.token_validator import TokenValidationError, validate_token_for_request
from users.services.auth_engine import AuthEngine

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
            payload = validate_token_for_request(
                request,
                token,
                check_session=True,
            )
        except TokenValidationError as e:
            raise exceptions.AuthenticationFailed(str(e)) from e
        except Exception as e:
            msg = "Authentication protocol error"
            raise exceptions.AuthenticationFailed(msg) from e

        user_id = payload.get("user_id")
        from users.models import CustomUser

        try:
            user = CustomUser.objects.get(id=user_id, is_active=True)
        except CustomUser.DoesNotExist:
            msg = "Subject user no longer exists or is inactive"
            raise exceptions.AuthenticationFailed(msg) from None

        session_id = payload.get("sid")
        if session_id:
            AuthEngine.touch_session(str(user.id), str(session_id))
        return (user, payload)

    def authenticate_header(self, request: Any) -> str:
        """
        Returns the challenge for the WWW-Authenticate header.
        """
        # Note: 'request' is required by the DRF method signature
        _ = request
        return "Bearer"
