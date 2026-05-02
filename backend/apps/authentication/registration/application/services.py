import logging
import secrets
from typing import Any

from django.core.cache import cache
from django.db import transaction

from authentication.security.application.services import (
    OtpDeliveryService,
    OtpValidationService,
)
from users.models import Client, CustomUser

logger = logging.getLogger("users")


class RegistrationService:
    @classmethod
    def initiate_signup(cls, email: str) -> None:
        """
        Starts the registration flow by triggering an OTP.
        """
        OtpDeliveryService.send_otp(
            email=email,
            purpose="registration",
            ignore_cooldown=True,
        )

    @classmethod
    def verify_registration_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> str | None:
        """
        Validates registration OTP and issues a signup token for the final step.
        """
        is_valid = OtpValidationService.validate_otp(
            identifier=email,
            otp_code=otp_code,
            request=request,
            consume=True,
            purpose="registration",
        )
        if not is_valid:
            return None

        if CustomUser.objects.filter(email__iexact=email, is_active=True).exists():
            return "ALREADY_EXISTS"

        signup_token = secrets.token_urlsafe(32)
        cache.set(
            f"signup_token:{signup_token}",
            email,
            timeout=1200,
        )
        return signup_token

    @classmethod
    @transaction.atomic
    def finalize_signup(
        cls,
        *,
        signup_token: str,
        full_name: str,
        username: str,
        password: str,
        request: Any | None = None,
    ) -> CustomUser | None:
        token_key = f"signup_token:{signup_token}"
        email = cache.get(token_key)
        if not email:
            return None

        if CustomUser.objects.filter(email__iexact=email).exists():
            cache.delete(token_key)
            return None

        user = CustomUser.objects.create_user(
            email=email,
            password=password,
            is_active=True,
        )
        Client.objects.create(user=user, full_name=full_name, username=username)

        cache.delete(token_key)
        return user
