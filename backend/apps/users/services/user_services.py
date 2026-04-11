from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from rest_framework.serializers import ValidationError

from users.models import Client, CustomUser
from core.auth.request_context import get_request_ip
from core.validators import (
    EmailFormatRule,
    MinMaxLengthRule,
    RequiredRule,
    ServiceValidator,
)

logger = logging.getLogger("users")


class UserService:
    """
    Business logic layer for user-related operations.
    """

    @classmethod
    @transaction.atomic
    def create_user(cls, data: dict[str, Any]) -> CustomUser:
        """
        Coordinates user creation and profile setup.
        Ensures CustomUser and associated Client (Profile) are created atomically,
        and automatically triggers the initial registration OTP delivery.
        """
        validator = ServiceValidator()
        schema = {
            "full_name": [RequiredRule(), MinMaxLengthRule(min_len=3)],
            "email": [RequiredRule(), EmailFormatRule()],
            "password": [RequiredRule(), MinMaxLengthRule(min_len=8)],
        }
        validator.run(data, schema)

        email = data["email"]
        password = data["password"]
        full_name = data["full_name"]
        user_type = data.get("user_type", CustomUser.UserType.USER)

        if CustomUser.objects.filter(email=email).exists():
            raise ValidationError(
                {
                    "email": [
                        {
                            "message": "User with this email already exists.",
                            "code": "unique_violation",
                            "severity": "error",
                        }
                    ]
                }
            )

        user = CustomUser.objects.create_user(
            email=email, password=password, user_type=user_type, is_active=False
        )

        Client.objects.create(user=user, full_name=full_name)

        cls.send_otp(user, ignore_cooldown=True)

        return user

    @staticmethod
    def send_otp(user: CustomUser, ignore_cooldown: bool = False) -> str:
        """
        Generates and transmits a secure OTP with built-in flood protection.
        Enforces a configurable cooldown period (OTP_RESEND_INTERVAL_SECONDS) between requests.
        """
        cache_key = f"otp:{user.id}:registration"
        cooldown_key = f"otp_cooldown:{user.id}"

        if not ignore_cooldown and cache.get(cooldown_key):
            remaining = cache.ttl(cooldown_key)
            wait_time = max(
                remaining if isinstance(remaining, int) and remaining > 0 else 0, 1
            )
            raise ValidationError(
                {
                    "email": f"Please wait {wait_time} seconds before requesting a new code."
                }
            ) from None

        otp = f"{secrets.randbelow(900000) + 100000}"
        salt = secrets.token_hex(16)
        digest = UserService._hash_otp(user, otp, salt)

        cache.set(
            cache_key,
            json.dumps({"salt": salt, "digest": digest}),
            timeout=settings.OTP_EXPIRATION_SECONDS,
        )
        cache.set(cooldown_key, "active", timeout=settings.OTP_RESEND_INTERVAL_SECONDS)
        cache.delete(f"otp_attempt_user:{user.id}")

        context = {
            "brand_name": settings.BRAND_NAME,
            "brand_slogan": settings.BRAND_SLOGAN,
            "brand_address": settings.BRAND_ADDRESS,
            "brand_color_primary": settings.BRAND_COLOR_PRIMARY,
            "brand_color_secondary": settings.BRAND_COLOR_SECONDARY,
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "current_year": datetime.now().year,
            "full_name": getattr(user.client, "full_name", "User"),
            "otp": otp,
            "expiry_minutes": settings.OTP_EXPIRATION_SECONDS // 60,
        }

        html_message = render_to_string("emails/registration_otp_email.html", context)
        plain_message = strip_tags(html_message)

        try:
            send_mail(
                subject=f"{settings.BRAND_NAME} • Your Verification Code",
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Failed to send OTP email to %s", user.email)
            raise ValidationError(
                {
                    "email": "The verification system is temporarily unavailable. Please try again later."
                }
            ) from e

        return otp

    @staticmethod
    def validate_otp(user: CustomUser, otp_code: str, request: Any | None = None) -> bool:
        """
        Verifies signup OTP against a hashed cache entry and enforces brute-force limits.
        """
        cache_key = f"otp:{user.id}:registration"
        ip_address = get_request_ip(request) if request else "0.0.0.0"
        ip_key = f"otp_attempt_ip:{ip_address}"
        ip_block_key = f"otp_block_ip:{ip_address}"
        user_key = f"otp_attempt_user:{user.id}"
        settings_map = settings.AUTH_ENGINE_SETTINGS

        if cache.get(ip_block_key):
            raise ValidationError(
                {
                    "otp_code": "Too many failed attempts from this IP. Try again later."
                }
            )

        max_user = settings_map["OTP_MAX_ATTEMPTS_PER_USER"]
        max_ip = settings_map["OTP_MAX_ATTEMPTS_PER_IP"]
        attempt_window = settings_map["OTP_ATTEMPT_WINDOW_SECONDS"]
        block_window = settings_map["OTP_IP_BLOCK_SECONDS"]

        user_attempts = int(cache.get(user_key, 0))
        ip_attempts = int(cache.get(ip_key, 0))
        if user_attempts >= max_user or ip_attempts >= max_ip:
            cache.set(ip_block_key, "1", timeout=block_window)
            logger.warning(
                "otp_rate_limit_triggered",
                extra={"user_id": str(user.id), "ip_address": ip_address},
            )
            raise ValidationError(
                {"otp_code": "Too many attempts. Please request a new code."}
            )

        stored_payload = cache.get(cache_key)
        if not stored_payload:
            return False

        try:
            parsed = json.loads(stored_payload)
            expected_digest = parsed["digest"]
            salt = parsed["salt"]
        except Exception:
            return False

        provided_digest = UserService._hash_otp(user, otp_code, salt)
        if hmac.compare_digest(expected_digest, provided_digest):
            cache.delete(cache_key)
            cache.delete(f"otp_cooldown:{user.id}")
            cache.delete(ip_key)
            cache.delete(user_key)
            return True

        cache.incr(ip_key)
        cache.expire(ip_key, attempt_window)
        cache.incr(user_key)
        cache.expire(user_key, attempt_window)
        logger.info(
            "otp_validation_failed",
            extra={"user_id": str(user.id), "ip_address": ip_address},
        )
        return False

    @staticmethod
    def _hash_otp(user: CustomUser, otp_code: str, salt: str) -> str:
        secret = settings.AUTH_ENGINE_SETTINGS["OTP_HASH_SECRET"]
        payload = f"{user.id}:{otp_code}:{salt}:{secret}"
        return hashlib.sha3_256(payload.encode("utf-8")).hexdigest()
