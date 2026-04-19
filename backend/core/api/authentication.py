from __future__ import annotations

from typing import Any

from rest_framework import authentication, exceptions

from authentication.core.token_validator import (
    TokenValidationError,
    TokenExpiredError,
    RefreshTokenExpiredError,
    validate_token_for_request,
)
from authentication.sessions.application.services import SessionQueryService
from authentication.identity.infrastructure.cache import RedisSessionStore
from core.middleware.request_context import set_current_session_id
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

                if session_id and not SessionQueryService.is_session_active(
                    user_id=user_id,
                    session_id=str(session_id),
                    jti=payload.get("jti", ""),
                    partner_jti=payload.get("partner_jti", ""),
                    token_type="access",
                    session_scope=payload.get("scope"),
                ):
                    raise TokenValidationError("Session is no longer active.")

        except (TokenExpiredError, RefreshTokenExpiredError):
            return None
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
                from datetime import UTC, datetime

                now_ts = int(datetime.now(UTC).timestamp())
                RedisSessionStore.touch_session(str(session_id), now_ts)
        return (user, payload)

    def authenticate_header(self, request: Any) -> str:
        """
        Returns the challenge for the WWW-Authenticate header.
        """
        # Note: 'request' is required by the DRF method signature
        _ = request
        return "Bearer"
