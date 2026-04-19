from __future__ import annotations

import logging
from typing import Any

from authentication.core.crypto import AuthCryptoEngine
from authentication.core.request_context import build_fingerprint, get_device_entropy
from authentication.identity.infrastructure.cache import TokenBlacklistService
from authentication.sessions.application.services import SessionQueryService

logger = logging.getLogger("core")


class TokenValidationError(ValueError):
    """Base token validation error. Carries a machine-readable error_code."""

    error_code: str = "AUTH_TOKEN_INVALID"

    def __init__(self, message: str, *, error_code: str | None = None) -> None:
        super().__init__(message)
        if error_code:
            self.error_code = error_code


class TokenExpiredError(TokenValidationError):
    """Raised when the token has passed its expiry window."""

    error_code = "AUTH_ACCESS_EXPIRED"


class RefreshTokenExpiredError(TokenValidationError):
    """Raised when a refresh token has passed its expiry window."""

    error_code = "AUTH_REFRESH_EXPIRED"


class TokenTamperedError(TokenValidationError):
    """Raised when the token signature/encryption cannot be verified."""

    error_code = "AUTH_TOKEN_TAMPERED"


class TokenRevokedError(TokenValidationError):
    """Raised when the token JTI is found in the blacklist."""

    error_code = "AUTH_REVOKED_BY_SYSTEM"


class SessionInactiveError(TokenValidationError):
    """Raised when the session tied to the token is no longer active in the DB."""

    error_code = "AUTH_SESSION_EXPIRED"


def validate_token_for_request(
    request: Any,
    token: str,
    *,
    expected_type: str | None = None,
    check_session: bool = False,
    grace_period_sec: int = 0,
) -> dict[str, Any]:
    # 1. Decrypt + verify signature
    try:
        payload = AuthCryptoEngine.decrypt_and_verify(token, grace_period_sec=grace_period_sec)
    except ValueError as exc:
        msg = str(exc)
        if "expired" in msg.lower():
            # Distinguish access vs refresh expiry based on expected_type hint
            if expected_type == "refresh":
                raise RefreshTokenExpiredError(msg) from exc
            raise TokenExpiredError(msg) from exc
        raise TokenTamperedError(msg) from exc

    # 2. Type check
    if expected_type and payload.get("type") != expected_type:
        msg = f"Invalid token type: expected {expected_type}."
        raise TokenTamperedError(msg)

    # 3. Blacklist check
    jti = payload.get("jti", "")
    subject_id = str(payload.get("sub") or payload.get("user_id") or "")
    if TokenBlacklistService.is_blacklisted(jti):
        logger.warning(
            "blacklist_hit", extra={"jti": jti, "user_id": subject_id}
        )
        raise TokenRevokedError("This session has been revoked by the system.")

    # 4. Fingerprint check
    current_fpt = build_fingerprint(request, device_entropy=get_device_entropy(request))
    if payload.get("fpt") != current_fpt:
        logger.warning(
            "fingerprint_mismatch",
            extra={"user_id": subject_id, "session_id": payload.get("sid")},
        )
        raise TokenTamperedError("Security breach: Token context mismatch detected.")

    # 5. Session active check
    if check_session:
        session_id = payload.get("sid")
        if session_id and not SessionQueryService.is_session_active(
            user_id=subject_id,
            session_id=session_id,
            jti=payload.get("jti", ""),
            partner_jti=payload.get("partner_jti", ""),
            scope=payload.get("scope"),
        ):
            logger.warning(
                "inactive_session_token_use",
                extra={"user_id": subject_id, "session_id": session_id},
            )
            raise SessionInactiveError("Session is no longer active.")

    if subject_id and "user_id" not in payload:
        payload["user_id"] = subject_id

    return payload
