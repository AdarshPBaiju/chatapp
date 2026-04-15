from __future__ import annotations

import hashlib
import json
import logging
import secrets
from django.utils import timezone
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

    OTP_PURPOSE_REGISTRATION = "registration"
    OTP_PURPOSE_PASSWORD_RESET = "password_reset"

    @classmethod
    def initiate_signup(cls, email: str) -> None:
        """
        Starts the registration flow by Sending OTP for the email.
        Does not create a user yet to prevent database bloat.
        """
        _existing_user = CustomUser.objects.filter(email__iexact=email).first()

        cls.send_otp(
            email=email,
            purpose=cls.OTP_PURPOSE_REGISTRATION,
            ignore_cooldown=True,
        )

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

        cls.send_otp(user, email=email, ignore_cooldown=True)

        return user

    @staticmethod
    def send_otp(
        user: CustomUser | None = None,
        email: str | None = None,
        ignore_cooldown: bool = False,
        purpose: str = OTP_PURPOSE_REGISTRATION,
    ) -> str:
        """
        Generates and transmits a secure OTP with built-in flood protection.
        Supports both existing users (by ID) and non-existent accounts (by Email).
        """
        if not user and not email:
            raise ValueError("Either user or email must be provided to send an OTP.")

        # Priority: If email is provided (for registration/reset), use it as the identifier.
        # Otherwise use the user ID (for logged-in actions).
        identifier = email if email else str(user.id)
        destination = email if email else user.email

        cache_key = UserService._otp_cache_key(identifier, purpose)
        cooldown_key = UserService._otp_cooldown_key(identifier, purpose)
        email_copy = UserService._otp_email_copy(purpose)

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
        digest = UserService._hash_otp(identifier, otp, salt)

        cache.set(
            cache_key,
            json.dumps({"salt": salt, "digest": digest}),
            timeout=settings.OTP_EXPIRATION_SECONDS,
        )
        cache.set(cooldown_key, "active", timeout=settings.OTP_RESEND_INTERVAL_SECONDS)
        cache.delete(UserService._otp_attempt_user_key(identifier, purpose))

        context = {
            "brand_name": settings.BRAND_NAME,
            "brand_slogan": settings.BRAND_SLOGAN,
            "brand_address": settings.BRAND_ADDRESS,
            "brand_color_primary": settings.BRAND_COLOR_PRIMARY,
            "brand_color_secondary": settings.BRAND_COLOR_SECONDARY,
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "current_year": timezone.now().year,
            "full_name": getattr(user.client, "full_name", "") if user else "Friend",
            "otp_code": otp,
            "expiry_minutes": settings.OTP_EXPIRATION_SECONDS // 60,
            **email_copy,
        }

        html_message = render_to_string("emails/auth/otp_modern.html", context)
        plain_message = strip_tags(html_message)

        try:
            send_mail(
                subject=email_copy["email_subject"],
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[destination],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as e:
            logger.exception("Failed to send OTP email to %s", destination)
            raise ValidationError(
                {
                    "email": "The verification system is temporarily unavailable. Please try again later."
                }
            ) from e

        return otp

    @staticmethod
    def validate_otp(
        identifier: str,
        otp_code: str,
        purpose: str = OTP_PURPOSE_REGISTRATION,
        consume: bool = True,
        request: Any | None = None,
    ) -> bool:
        """
        Validates an OTP against the secure cache and enforces brute-force protection.
        Uses either a user ID or an email as the identifier.
        """
        cache_key = UserService._otp_cache_key(identifier, purpose)
        ip_address = None
        if request:
            ip_address = get_request_ip(request)

        ip_key = (
            UserService._otp_attempt_ip_key(ip_address, purpose) if ip_address else None
        )
        ip_block_key = (
            UserService._otp_block_ip_key(ip_address, purpose) if ip_address else None
        )
        user_key = UserService._otp_attempt_user_key(identifier, purpose)

        if ip_block_key and cache.get(ip_block_key):
            raise ValidationError(
                {
                    "otp_code": "Too many failed attempts from this IP. Please try again later."
                }
            )

        cached_data = cache.get(cache_key)
        if not cached_data:
            cls = UserService
            if ip_key:
                cls._increment_attempt_counter(ip_key, 3600)
            cls._increment_attempt_counter(user_key, 3600)
            return False

        data = json.loads(cached_data)
        if UserService._hash_otp(identifier, otp_code, data["salt"]) != data["digest"]:
            cls = UserService
            if ip_key:
                cls._increment_attempt_counter(ip_key, 3600)
            cls._increment_attempt_counter(user_key, 3600)
            return False

        if consume:
            cache.delete(cache_key)
            cache.delete(user_key)
            cache.delete(UserService._otp_cooldown_key(identifier, purpose))

        return True

    @classmethod
    def request_password_reset(cls, email: str) -> None:
        """
        Initiates password reset. Sends OTP even if user doesn't exist for enumeration protection.
        """
        user = CustomUser.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            # Security: Send OTP to the email address even if no account exists.
            # This prevents timing/response leakage about account existence.
            cls.send_otp(email=email, purpose=cls.OTP_PURPOSE_PASSWORD_RESET)
            return
        cls.send_otp(user=user, email=email, purpose=cls.OTP_PURPOSE_PASSWORD_RESET)

    @classmethod
    def verify_password_reset_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> bool:
        """
        Verifies reset OTP using email as identifier.
        """
        return cls.validate_otp(
            identifier=email,
            otp_code=otp_code,
            request=request,
            purpose=cls.OTP_PURPOSE_PASSWORD_RESET,
            consume=True,
        )

    @classmethod
    def generate_password_reset_token(cls, user: CustomUser) -> str:
        """
        Generates a secure, short-lived token for the final password reset step.
        """
        from core.auth.crypto import AuthCryptoEngine

        payload = {
            "sub": str(user.id),
            "purpose": "password_reset",
            "email": user.email,
        }
        # Valid for 10 minutes
        return AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=600)

    @classmethod
    def validate_password_reset_token(cls, token: str) -> str:
        """
        Validates the reset token and returns the user ID if valid.
        """
        from core.auth.crypto import AuthCryptoEngine

        try:
            payload = AuthCryptoEngine.decrypt_and_verify(token)
            if payload.get("purpose") != "password_reset":
                raise ValueError("Invalid token purpose.")
            return payload["sub"]
        except Exception as e:
            raise ValidationError({"reset_token": str(e)}) from e

    @classmethod
    @transaction.atomic
    def reset_password_with_token(
        cls,
        *,
        reset_token: str,
        password: str,
        request: Any | None = None,
    ) -> bool:
        user_id = cls.validate_password_reset_token(reset_token)
        user = CustomUser.objects.filter(id=user_id, is_active=True).first()
        if not user:
            return False

        user.set_password(password)
        user.save(update_fields=["password"])

        from users.services.auth_engine import AuthEngine

        AuthEngine.revoke_all_sessions(str(user.id))

        logger.info(
            "password_reset_completed",
            extra={
                "user_id": str(user.id),
                "ip_address": get_request_ip(request) if request else "unknown",
            },
        )
        return True

    @classmethod
    def verify_registration_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> str | None:
        """
        Validates registration OTP and issues a signup token for the final step.
        """
        is_valid = cls.validate_otp(
            identifier=email,
            otp_code=otp_code,
            request=request,
            consume=True,
            purpose=cls.OTP_PURPOSE_REGISTRATION,
        )
        if not is_valid:
            return None

        # After proving ownership, check if fully active account exists
        if CustomUser.objects.filter(email__iexact=email, is_active=True).exists():
            return "ALREADY_EXISTS"

        signup_token = secrets.token_urlsafe(32)
        cache.set(
            cls._signup_token_key(signup_token),
            email,
            timeout=1200,  # 20 minutes for the user to enter details
        )
        return signup_token

    @classmethod
    @transaction.atomic
    def finalize_signup(
        cls,
        *,
        signup_token: str,
        full_name: str,
        password: str,
        request: Any | None = None,
    ) -> CustomUser | None:
        """
        Finalizes registration by verifying the signup token and creating the user.
        """
        email = cache.get(cls._signup_token_key(signup_token))
        if not email:
            return None

        # Check again if user was created while user was on the form
        if CustomUser.objects.filter(email__iexact=email).exists():
            cache.delete(cls._signup_token_key(signup_token))
            return None

        user = CustomUser.objects.create_user(
            email=email,
            password=password,
            is_active=True,
        )
        Client.objects.create(user=user, full_name=full_name)

        # Cleanup token
        cache.delete(cls._signup_token_key(signup_token))
        return user

    @staticmethod
    def _hash_otp(identifier: str, otp_code: str, salt: str) -> str:
        """Computes a cryptographically secure hash of the OTP for comparisons."""
        secret = settings.SECRET_KEY
        payload = f"{identifier}:{otp_code}:{salt}:{secret}"
        return hashlib.sha3_256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _otp_cache_key(identifier: str, purpose: str) -> str:
        return f"otp:{identifier}:{purpose}"

    @staticmethod
    def _otp_cooldown_key(identifier: str, purpose: str) -> str:
        return f"otp_cooldown:{identifier}:{purpose}"

    @staticmethod
    def _otp_attempt_user_key(identifier: str, purpose: str) -> str:
        return f"otp_attempt_user:{purpose}:{identifier}"

    @staticmethod
    def _signup_token_key(token: str) -> str:
        return f"signup_token:{token}"

    @staticmethod
    def _otp_attempt_ip_key(ip_address: str, purpose: str) -> str:
        return f"otp_attempt_ip:{purpose}:{ip_address}"

    @staticmethod
    def _otp_block_ip_key(ip_address: str, purpose: str) -> str:
        return f"otp_block_ip:{purpose}:{ip_address}"

    @staticmethod
    def _increment_attempt_counter(key: str, ttl: int) -> None:
        current = cache.get(key)
        if current is None:
            cache.set(key, 1, timeout=ttl)
            return

        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, int(current) + 1, timeout=ttl)
            return

        import contextlib

        touch = getattr(cache, "touch", None)
        if callable(touch):
            with contextlib.suppress(Exception):
                touch(key, ttl)

    @staticmethod
    def _otp_email_copy(purpose: str) -> dict[str, str]:
        if purpose == UserService.OTP_PURPOSE_PASSWORD_RESET:
            return {
                "email_subject": f"{settings.BRAND_NAME} • Your Password Reset Code",
                "email_title": "Reset Your Password",
                "email_intro": (
                    f"We received a request to reset your {settings.BRAND_NAME} password. "
                    "Use the secure 6-digit code below to continue."
                ),
                "email_instruction": (
                    "Enter this code on the password reset screen to choose a new password."
                ),
                "email_footer_note": (
                    f"You're receiving this email because a password reset was requested for your {settings.BRAND_NAME} account."
                ),
                "email_badge_label": "Password reset verification",
                "email_compatibility_note": "Secure password recovery in progress",
            }

        return {
            "email_subject": f"{settings.BRAND_NAME} • Your Verification Code",
            "email_title": "Welcome",
            "email_intro": (
                f"Thank you for joining {settings.BRAND_NAME}. To complete your registration and activate your account, "
                "please verify your email address using the secure 6-digit code below."
            ),
            "email_instruction": (
                "Enter this code on the registration screen to verify your email address."
            ),
            "email_footer_note": (
                f"You're receiving this email because you just registered on the {settings.BRAND_NAME} platform."
            ),
            "email_badge_label": "New account verification",
            "email_compatibility_note": f"Welcome to {settings.BRAND_NAME} — verify to start creating",
        }
