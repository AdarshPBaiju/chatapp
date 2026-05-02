import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any

import pyotp
from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone as dj_timezone
from django.utils.html import strip_tags
from rest_framework.serializers import ValidationError

from authentication.core.request_context import get_request_ip
from users.models import CustomUser

logger = logging.getLogger("users")


class OtpHashingService:
    @staticmethod
    def hash_otp(identifier: str, otp: str, salt: str) -> str:
        secret = settings.AUTH_ENGINE_SETTINGS.get(
            "OTP_HASH_SECRET", "default-otp-secret"
        )
        msg = f"{identifier}:{otp}:{salt}:{secret}".encode()
        return hashlib.sha256(msg).hexdigest()


class EmailOtpService:
    @classmethod
    def generate_otp(cls, email: str, flow_id: str, window_offset: int = 0) -> str:
        """
        Generates a 6-digit numeric string locked into a 2-minute sliding epoch.
        """
        window = int(time.time() / 120) + window_offset
        message = f"{email}:{flow_id}:{window}".encode()
        secret_key = settings.SECRET_KEY.encode()

        digest = hmac.new(secret_key, message, hashlib.sha256).hexdigest()
        return str(int(digest[:8], 16) % 1000000).zfill(6)

    @classmethod
    def verify_otp(cls, email: str, flow_id: str, submitted_code: str) -> bool:
        """
        Checks the submitted code against the current window and trailing window.
        """
        if not submitted_code or len(submitted_code) != 6:
            return False

        return hmac.compare_digest(
            cls.generate_otp(email, flow_id, window_offset=0), submitted_code
        ) or hmac.compare_digest(
            cls.generate_otp(email, flow_id, window_offset=-1), submitted_code
        )


class OtpDeliveryService:
    @classmethod
    def send_otp(
        cls,
        user: CustomUser | None = None,
        email: str | None = None,
        ignore_cooldown: bool = False,
        purpose: str = "registration",
    ) -> str:
        if not user and not email:
            raise ValueError("Either user or email must be provided.")

        identifier = email or str(user.id)
        destination = email or user.email

        cache_key = f"otp:{identifier}:{purpose}"
        cooldown_key = f"otp_cooldown:{identifier}:{purpose}"

        if not ignore_cooldown and cache.get(cooldown_key):
            try:
                remaining = cache.ttl(cooldown_key)
            except AttributeError:
                remaining = settings.OTP_RESEND_INTERVAL_SECONDS

            wait_time = max(
                remaining if isinstance(remaining, int) and remaining > 0 else 0, 1
            )
            raise ValidationError({
                "email": f"Please wait {wait_time} seconds before requesting a new code."
            })

        otp = f"{secrets.randbelow(900000) + 100000}"
        salt = secrets.token_hex(16)
        digest = OtpHashingService.hash_otp(identifier, otp, salt)

        cache.set(
            cache_key,
            json.dumps({"salt": salt, "digest": digest}),
            timeout=settings.OTP_EXPIRATION_SECONDS,
        )
        cache.set(cooldown_key, "active", timeout=settings.OTP_RESEND_INTERVAL_SECONDS)
        cache.delete(f"otp_attempt_user:{purpose}:{identifier}")

        context = {
            "brand_name": settings.BRAND_NAME,
            "brand_slogan": settings.BRAND_SLOGAN,
            "brand_address": settings.BRAND_ADDRESS,
            "brand_color_primary": settings.BRAND_COLOR_PRIMARY,
            "brand_color_secondary": settings.BRAND_COLOR_SECONDARY,
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "current_year": dj_timezone.now().year,
            "full_name": getattr(user.client, "full_name", "") if user else "Friend",
            "otp_code": otp,
            "expiry_minutes": settings.OTP_EXPIRATION_SECONDS // 60,
            **cls._get_email_copy(purpose),
        }

        html_message = render_to_string("emails/auth/otp_modern.html", context)
        plain_message = strip_tags(html_message)

        try:
            send_mail(
                subject=context["email_subject"],
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[destination],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Failed to send OTP email to %s", destination)
            raise ValidationError({
                "email": "Verification system unavailable. Please try again later."
            }) from e

        return otp

    @classmethod
    def send_stateless_otp(cls, user: CustomUser, flow_id: str) -> None:
        otp = EmailOtpService.generate_otp(user.email, flow_id)

        email_copy = {
            "email_subject": f"{settings.BRAND_NAME} • Your Login Verification Code",
            "email_title": "Secure Login Requested",
            "email_intro": (
                f"You're attempting to sign in to {settings.BRAND_NAME}. "
                "For your protection, please verify your identity using the 6-digit code below."
            ),
            "email_instruction": (
                "Enter this code on the login screen to complete your sign-in process."
            ),
            "email_footer_note": (
                "If you did not request this code, please ignore this email or secure your account password."
            ),
            "email_badge_label": "Identity verification",
            "email_compatibility_note": f"Logging in to {settings.BRAND_NAME}",
        }

        context = {
            "brand_name": settings.BRAND_NAME,
            "brand_slogan": settings.BRAND_SLOGAN,
            "brand_address": settings.BRAND_ADDRESS,
            "brand_color_primary": settings.BRAND_COLOR_PRIMARY,
            "brand_color_secondary": settings.BRAND_COLOR_SECONDARY,
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "current_year": dj_timezone.now().year,
            "full_name": getattr(user.client, "full_name", "") if user else "Friend",
            "otp_code": otp,
            "expiry_minutes": 2,
            **email_copy,
        }

        html_message = render_to_string("emails/auth/otp_modern.html", context)
        plain_message = strip_tags(html_message)

        try:
            send_mail(
                subject=email_copy["email_subject"],
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Failed to send stateless OTP email to %s", user.email)
            raise ValidationError({
                "email": "Verification system unavailable. Please try again later."
            }) from e

    @staticmethod
    def _get_email_copy(purpose: str) -> dict[str, str]:
        if purpose == "password_reset":
            return {
                "email_subject": f"{settings.BRAND_NAME} • Your Password Reset Code",
                "email_title": "Reset Your Password",
                "email_intro": f"We received a request to reset your {settings.BRAND_NAME} password.",
                "email_instruction": "Enter this code on the password reset screen to choose a new password.",
                "email_footer_note": "A password reset was requested for your account.",
                "email_badge_label": "Password reset",
                "email_compatibility_note": "Secure password recovery",
            }
        return {
            "email_subject": f"{settings.BRAND_NAME} • Your Verification Code",
            "email_title": "Welcome",
            "email_intro": f"Thank you for joining {settings.BRAND_NAME}. Please verify your email.",
            "email_instruction": "Enter this code on the registration screen to verify your email address.",
            "email_footer_note": "You registered on the Vibe platform.",
            "email_badge_label": "New account verification",
            "email_compatibility_note": "Welcome to Vibe",
        }


class MockRequest:
    def __init__(self, user, ip="127.0.0.1"):
        self.user = user
        self.META = {"REMOTE_ADDR": ip, "HTTP_USER_AGENT": "Mozilla/5.0"}
        self.COOKIES = {}


class OtpValidationService:
    @classmethod
    def validate_otp(
        cls,
        identifier: str,
        otp_code: str,
        purpose: str = "registration",
        consume: bool = True,
        request: Any | None = None,
    ) -> bool:
        cache_key = f"otp:{identifier}:{purpose}"
        ip_address = get_request_ip(request) if request else None

        ip_key = f"otp_attempt_ip:{purpose}:{ip_address}" if ip_address else None
        ip_block_key = f"otp_block_ip:{purpose}:{ip_address}" if ip_address else None
        user_key = f"otp_attempt_user:{purpose}:{identifier}"

        if ip_block_key and cache.get(ip_block_key):
            raise ValidationError({"otp_code": "Too many failed attempts. IP blocked."})

        cached_data = cache.get(cache_key)
        if not cached_data:
            cls._track_failure(ip_key, user_key)
            return False

        data = json.loads(cached_data)
        import re

        # Find 6 digits that may be separated by whitespace (due to HTML boxes)
        match = re.search(r"(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)", otp_code)
        if not match or (
            OtpHashingService.hash_otp(
                identifier, "".join(match.groups()), data["salt"]
            )
            != data["digest"]
        ):
            cls._track_failure(ip_key, user_key)
            return False

        if consume:
            cache.delete(cache_key)
            cache.delete(user_key)
            cache.delete(f"otp_cooldown:{identifier}:{purpose}")

        return True

    @staticmethod
    def _track_failure(ip_key: str | None, user_key: str) -> None:
        ttl = 3600
        if ip_key:
            current = cache.get(ip_key) or 0
            cache.set(ip_key, int(current) + 1, timeout=ttl)

        current_user = cache.get(user_key) or 0
        cache.set(user_key, int(current_user) + 1, timeout=ttl)


class TotpService:
    @staticmethod
    def verify_totp(client_instance: Any, submitted_code: str) -> bool:
        """
        Verifies a 6-digit TOTP code against the client's registered secret.
        """
        if not client_instance.totp_secret or not submitted_code:
            return False

        totp = pyotp.TOTP(client_instance.totp_secret)
        return totp.verify(submitted_code, valid_window=1)

    @staticmethod
    def verify_and_burn_backup_code(client_instance: Any, submitted_code: str) -> bool:
        """
        Checks if the submitted code matches the client's hashed backup list.
        If found, it is PERMANENTLY removed (Single-use burn).
        """
        if not submitted_code or not client_instance.backup_codes:
            return False

        return client_instance.verify_and_burn_backup_code(submitted_code)
