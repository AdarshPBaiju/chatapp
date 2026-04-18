from __future__ import annotations

import logging
from typing import Any

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import build_fingerprint, get_device_entropy
from users.services.auth_engine import AuthEngine

logger = logging.getLogger("core")


class TokenValidationError(ValueError):
    pass


def validate_token_for_request(
    request: Any,
    token: str,
    *,
    expected_type: str | None = None,
    check_session: bool = False,
    grace_period_sec: int = 0,
) -> dict[str, Any]:
    try:
        payload = AuthCryptoEngine.decrypt_and_verify(token, grace_period_sec=grace_period_sec)
    except ValueError as exc:
        raise TokenValidationError(str(exc)) from exc

    if expected_type and payload.get("type") != expected_type:
        msg = f"Invalid token type: expected {expected_type}."
        raise TokenValidationError(msg)

    jti = payload.get("jti", "")
    if AuthEngine.is_blacklisted(jti):
        logger.warning(
            "blacklist_hit", extra={"jti": jti, "user_id": payload.get("user_id")}
        )
        raise TokenValidationError("This session has been revoked by the system.")

    current_fpt = build_fingerprint(request, device_entropy=get_device_entropy(request))
    if payload.get("fpt") != current_fpt:
        logger.warning(
            "fingerprint_mismatch",
            extra={"user_id": payload.get("user_id"), "session_id": payload.get("sid")},
        )
        raise TokenValidationError("Security breach: Token context mismatch detected.")

    if check_session:
        session_id = payload.get("sid")
        if session_id and not AuthEngine.is_session_active(
            user_id=str(payload.get("user_id", "")),
            session_id=session_id,
            jti=payload.get("jti", ""),
            partner_jti=payload.get("partner_jti", ""),
        ):
            logger.warning(
                "inactive_session_token_use",
                extra={"user_id": payload.get("user_id"), "session_id": session_id},
            )
            raise TokenValidationError("Session is no longer active.")

    return payload
