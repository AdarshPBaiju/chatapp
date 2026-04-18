from __future__ import annotations

from typing import Any

from rest_framework import authentication, exceptions

from core.auth.token_validator import TokenValidationError, validate_token_for_request
from core.middleware.request_context import set_current_session_id
from users.services.auth_engine import AuthEngine
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
                check_session=False,
            )
            if payload.get("scope") != "revoke_only":
                session_id = payload.get("sid")
                user_id = str(payload.get("user_id", ""))

                if session_id and not AuthEngine.is_session_active(
                    user_id=user_id,
                    session_id=str(session_id),
                    jti=payload.get("jti", ""),
                    partner_jti=payload.get("partner_jti", ""),
                    scope=payload.get("scope"),
                ):
                    raise TokenValidationError("Session is no longer active.")

                # Dynamic limit check: if limit decreased globally, downgrade on next request
                if AuthEngine._count_active_sessions(user_id) > AuthEngine._device_limit():
                    raise TokenValidationError("Session limit reached. Revoke a session to continue.")
        except TokenValidationError as e:
            raise exceptions.AuthenticationFailed(str(e)) from e
        except Exception as e:
            msg = "Authentication protocol error"
            raise exceptions.AuthenticationFailed(msg) from e

        user_id = payload.get("user_id")

        try:
            user = CustomUser.objects.get(id=user_id, is_active=True)
        except CustomUser.DoesNotExist:
            msg = "Subject user no longer exists or is inactive"
            raise exceptions.AuthenticationFailed(msg) from None

        session_id = payload.get("sid")
        if session_id:
            set_current_session_id(str(session_id))
            if payload.get("scope") != "revoke_only":
                AuthEngine.touch_session(str(user.id), str(session_id))
        return (user, payload)

    def authenticate_header(self, request: Any) -> str:
        """
        Returns the challenge for the WWW-Authenticate header.
        """
        # Note: 'request' is required by the DRF method signature
        _ = request
        return "Bearer"
