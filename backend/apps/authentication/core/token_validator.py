from __future__ import annotations

import logging
import threading
import time
from typing import Any

import requests
from django.conf import settings

from authentication.core.crypto import AuthCryptoEngine
from authentication.core.request_context import (
    build_fingerprint,
    get_device_entropy,
    get_request_ip,
)
from core.utils.debug import debug_print
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


class CircuitBreaker:
    """Simple state-machine based circuit breaker to protect against service flapping."""

    def __init__(self, failure_threshold=3, reset_timeout=30):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.last_failure_time = 0
        self.state = "CLOSED"
        self._lock = threading.Lock()

    def is_open(self) -> bool:
        with self._lock:
            if self.state == "OPEN":
                if time.time() - self.last_failure_time > self.reset_timeout:
                    self.state = "HALF_OPEN"
                    return False
                return True
            return False

    def record_failure(self):
        with self._lock:
            self.failures += 1
            self.last_failure_time = time.time()
            if self.failures >= self.failure_threshold:
                self.state = "OPEN"
                logger.error(
                    "circuit_breaker_tripped", extra={"failures": self.failures}
                )

    def record_success(self):
        with self._lock:
            self.failures = 0
            self.state = "CLOSED"


GO_AUTH_BREAKER = CircuitBreaker()


ERROR_CODE_EXCEPTION_MAP: dict[str, type[TokenValidationError]] = {
    TokenExpiredError.error_code: TokenExpiredError,
    RefreshTokenExpiredError.error_code: RefreshTokenExpiredError,
    TokenTamperedError.error_code: TokenTamperedError,
    TokenRevokedError.error_code: TokenRevokedError,
    SessionInactiveError.error_code: SessionInactiveError,
}


def _fallback_or_raise(fallback_to_local: bool, message: str) -> None:
    if fallback_to_local:
        debug_print(f"Falling back to local validation: {message}", prefix="FALLBACK")
        return
    raise TokenValidationError(message)


def _validate_token_locally(
    request: Any,
    token: str,
    *,
    expected_type: str | None = None,
    check_session: bool = False,
    grace_period_sec: int = 0,
) -> dict[str, Any]:
    # 1. Decrypt + verify signature
    try:
        payload = AuthCryptoEngine.decrypt_and_verify(
            token, grace_period_sec=grace_period_sec
        )
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
        logger.warning("blacklist_hit", extra={"jti": jti, "user_id": subject_id})
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
            token_type=expected_type,
            session_scope=payload.get("scope"),
        ):
            logger.warning(
                "inactive_session_token_use",
                extra={"user_id": subject_id, "session_id": session_id},
            )
            raise SessionInactiveError("Session is no longer active.")

    if subject_id and "user_id" not in payload:
        payload["user_id"] = subject_id

    # MIRROR: Add security enrichment and risk scoring to local path
    _enrich_payload_with_security_data(request, payload)

    return payload


def _build_go_auth_payload(
    request: Any,
    token: str,
    *,
    expected_type: str | None,
    check_session: bool,
    grace_period_sec: int,
) -> dict[str, Any]:
    device_entropy = get_device_entropy(request)
    return {
        "token": token,
        "expected_type": expected_type,
        "check_session": check_session,
        "grace_period_sec": grace_period_sec,
        "request_context": {
            "ip_address": get_request_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", ""),
            "accept_language": request.META.get("HTTP_ACCEPT_LANGUAGE", "")[:50],
            "timezone_offset": request.META.get("HTTP_X_TIMEZONE_OFFSET", "0"),
            "device_entropy": device_entropy,
            "fingerprint": build_fingerprint(request, device_entropy=device_entropy),
        },
    }


def _validate_token_with_go_auth(
    request: Any,
    token: str,
    *,
    expected_type: str | None = None,
    check_session: bool = False,
    grace_period_sec: int = 0,
) -> dict[str, Any] | None:
    go_auth_settings = getattr(settings, "GO_AUTH_SETTINGS", {})
    if not go_auth_settings.get("ENABLED"):
        return None

    verify_url = go_auth_settings.get("VERIFY_URL", "").strip()
    internal_secret = go_auth_settings.get("INTERNAL_SERVICE_SECRET", "").strip()
    fallback_to_local = bool(go_auth_settings.get("FALLBACK_TO_LOCAL", True))
    timeout_seconds = float(go_auth_settings.get("TIMEOUT_SECONDS", 2.0))

    if not verify_url or not internal_secret:
        logger.warning("go_auth_not_configured")
        return _fallback_or_raise(
            fallback_to_local,
            "The Go authentication service is not configured.",
        )

    debug_print(f"Calling Go Auth Service at {verify_url}...", prefix="GO-AUTH")
    try:
        response = requests.post(
            verify_url,
            json=_build_go_auth_payload(
                request,
                token,
                expected_type=expected_type,
                check_session=check_session,
                grace_period_sec=grace_period_sec,
            ),
            headers={
                "X-Internal-Service-Secret": internal_secret,
                "Content-Type": "application/json",
            },
            timeout=timeout_seconds,
        )
    except requests.RequestException:
        logger.exception("go_auth_request_failed")
        return _fallback_or_raise(
            fallback_to_local,
            "The Go authentication service is unavailable.",
        )

    try:
        body = response.json()
    except ValueError:
        logger.warning(
            "go_auth_invalid_json", extra={"status_code": response.status_code}
        )
        return _fallback_or_raise(
            fallback_to_local,
            "The Go authentication service returned invalid JSON.",
        )

    if response.status_code == 200:
        data = body.get("data", {})
        payload = data.get("payload")
        if isinstance(payload, dict):
            # Inject enrichment data into the payload for downstream use
            payload["risk_score"] = data.get("risk_score", 0)
            payload["location"] = data.get("location")
            debug_print(
                f"Go Auth Success! Risk Score: {payload.get('risk_score', 0)}",
                prefix="SUCCESS",
            )
            return payload
        logger.warning("go_auth_missing_payload")
        return _fallback_or_raise(
            fallback_to_local,
            "The Go authentication service returned an invalid payload.",
        )

    error_code = body.get("error_code", "")
    message = body.get("message") or "Authentication protocol error"

    if response.status_code in {500, 501, 502, 503, 504}:
        logger.warning(
            "go_auth_unavailable",
            extra={"status_code": response.status_code, "error_code": error_code},
        )
        return _fallback_or_raise(
            fallback_to_local,
            "The Go authentication service is unavailable.",
        )

    error_cls = ERROR_CODE_EXCEPTION_MAP.get(error_code)
    if error_cls:
        raise error_cls(message)

    logger.warning(
        "go_auth_unrecognized_response",
        extra={"status_code": response.status_code, "error_code": error_code},
    )
    return _fallback_or_raise(
        fallback_to_local,
        "The Go authentication service returned an unrecognized response.",
    )


def validate_token_for_request(
    request: Any,
    token: str,
    *,
    expected_type: str | None = None,
    check_session: bool = False,
    grace_period_sec: int = 0,
) -> dict[str, Any]:
    # CIRCUIT BREAKER: Check if we should even try Go Auth
    if not GO_AUTH_BREAKER.is_open():
        payload = _validate_token_with_go_auth(
            request,
            token,
            expected_type=expected_type,
            check_session=check_session,
            grace_period_sec=grace_period_sec,
        )
        if payload is not None:
            GO_AUTH_BREAKER.record_success()
            return payload

        # If we reached here, it means Go Auth failed (unavailable)
        GO_AUTH_BREAKER.record_failure()
    else:
        logger.debug("circuit_breaker_active_skipping_go_auth")

    return _validate_token_locally(
        request,
        token,
        expected_type=expected_type,
        check_session=check_session,
        grace_period_sec=grace_period_sec,
    )


def _enrich_payload_with_security_data(request: Any, payload: dict[str, Any]) -> None:
    """Mirrors the enrichment and risk scoring features of the Go Auth service."""
    ip = get_request_ip(request)
    current_loc = _get_location_from_enrichment_service(ip)
    payload["location"] = current_loc

    risk_score = 0
    subject_id = payload.get("user_id")
    if subject_id and current_loc:
        # Fetch last session location for risk calculation
        from authentication.sessions.application.services import SessionQueryService

        last_loc_data, last_seen = SessionQueryService.get_last_session_location(
            subject_id, exclude_session_id=payload.get("sid")
        )
        if last_loc_data:
            risk_score = _get_risk_score_from_risk_service(
                current_loc, last_loc_data, last_seen
            )

    payload["risk_score"] = risk_score


def _get_location_from_enrichment_service(ip: str) -> dict[str, Any] | None:
    go_auth_settings = getattr(settings, "GO_AUTH_SETTINGS", {})
    enrich_url = go_auth_settings.get("ENRICHMENT_URL", "http://go-enrichment:8081")
    secret = go_auth_settings.get("INTERNAL_SERVICE_SECRET")

    try:
        resp = requests.post(
            f"{enrich_url}/api/v1/enrich/ip",
            json={"ip": ip},
            headers={"X-Internal-Service-Secret": secret},
            timeout=1.0,
        )
        if resp.status_code == 200:
            return resp.json().get("data")
    except Exception:
        logger.debug("enrichment_service_unreachable")
    return None


def _get_risk_score_from_risk_service(current_loc, last_loc, last_seen) -> int:
    go_auth_settings = getattr(settings, "GO_AUTH_SETTINGS", {})
    risk_url = go_auth_settings.get("RISK_URL", "http://go-risk:8082")
    secret = go_auth_settings.get("INTERNAL_SERVICE_SECRET")

    try:
        # Format last_seen for JSON (ISO format)
        last_seen_str = (
            last_seen.isoformat() if hasattr(last_seen, "isoformat") else str(last_seen)
        )

        resp = requests.post(
            f"{risk_url}/api/v1/score/login",
            json={
                "current_location": current_loc,
                "last_location": last_loc,
                "last_seen_at": last_seen_str,
            },
            headers={"X-Internal-Service-Secret": secret},
            timeout=1.0,
        )
        if resp.status_code == 200:
            return resp.json().get("data", {}).get("risk_score", 0)
    except Exception:
        logger.debug("risk_service_unreachable")
    return 0
