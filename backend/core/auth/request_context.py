from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from rest_framework.response import Response
from user_agents import parse


@dataclass(slots=True)
class AuthRequestContext:
    ip_address: str
    device_label: str
    fingerprint: str
    device_entropy: str
    accept_language: str
    timezone_offset: str


def _normalize_user_agent(user_agent: str) -> str:
    ua = parse(user_agent or "")
    return f"{ua.browser.family}|{ua.os.family}|{ua.device.family}"


def get_request_ip(request: Any) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


def get_device_entropy(request: Any) -> str:
    header_name = "HTTP_X_DEVICE_ENTROPY"
    cookie_name = settings.AUTH_ENGINE_SETTINGS["DEVICE_ENTROPY_COOKIE_NAME"]
    from_header = request.META.get(header_name, "").strip()
    from_cookie = request.COOKIES.get(cookie_name, "").strip()
    return from_header or from_cookie


def generate_device_entropy() -> str:
    return secrets.token_urlsafe(32)


def build_fingerprint(request: Any, device_entropy: str = "") -> str:
    ua_norm = _normalize_user_agent(request.META.get("HTTP_USER_AGENT", ""))
    lang = request.META.get("HTTP_ACCEPT_LANGUAGE", "")[:50]
    timezone_offset = request.headers.get("X-Timezone-Offset", "0")
    payload = f"{ua_norm}:{lang}:{timezone_offset}:{device_entropy}"
    return hashlib.sha3_256(payload.encode("utf-8")).hexdigest()


def build_auth_request_context(request: Any) -> AuthRequestContext:
    device_entropy = get_device_entropy(request)
    fingerprint = build_fingerprint(request, device_entropy=device_entropy)
    return AuthRequestContext(
        ip_address=get_request_ip(request),
        device_label=parse_device_info(request),
        fingerprint=fingerprint,
        device_entropy=device_entropy,
        accept_language=request.META.get("HTTP_ACCEPT_LANGUAGE", "")[:50],
        timezone_offset=request.headers.get("X-Timezone-Offset", "0"),
    )


def parse_device_info(request: Any) -> str:
    ua_string = request.META.get("HTTP_USER_AGENT", "")
    user_agent = parse(ua_string)
    browser = user_agent.browser.family
    os_family = user_agent.os.family
    device = user_agent.device.family

    if user_agent.is_mobile:
        return f"{browser} on {device} ({os_family})"
    if user_agent.is_pc:
        return f"{browser} on {os_family}"
    return f"{browser} on {os_family} ({device})"


def attach_device_entropy_cookie(response: Response, device_entropy: str) -> Response:
    config = settings.AUTH_ENGINE_SETTINGS
    response.set_cookie(
        key=config["DEVICE_ENTROPY_COOKIE_NAME"],
        value=device_entropy,
        max_age=config["DEVICE_ENTROPY_COOKIE_MAX_AGE"],
        secure=config["DEVICE_ENTROPY_COOKIE_SECURE"],
        httponly=True,
        samesite=config["DEVICE_ENTROPY_COOKIE_SAMESITE"],
    )
    return response
