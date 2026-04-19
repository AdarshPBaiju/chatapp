from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from rest_framework.serializers import ValidationError

from authentication.security.application.services import OtpDeliveryService
from authentication.registration.application.services import RegistrationService
from authentication.recovery.application.services import RecoveryService

from users.models import Client, CustomUser
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
    Delegates authentication-related tasks to the authentication app.
    """

    @classmethod
    def initiate_signup(cls, email: str) -> None:
        RegistrationService.initiate_signup(email)

    @classmethod
    @transaction.atomic
    def create_user(cls, data: dict[str, Any]) -> CustomUser:
        """
        Coordinates user creation and profile setup.
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

        OtpDeliveryService.send_otp(user, email=email, ignore_cooldown=True)

        return user

    @classmethod
    def request_password_reset(cls, email: str) -> None:
        RecoveryService.request_password_reset(email)

    @classmethod
    def verify_password_reset_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> bool:
        return bool(RecoveryService.verify_password_reset_otp(email, otp_code, request))

    @classmethod
    @transaction.atomic
    def reset_password_with_token(
        cls,
        *,
        reset_token: str,
        password: str,
        request: Any | None = None,
    ) -> bool:
        return RecoveryService.reset_password(reset_token, password)

    @classmethod
    def verify_registration_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> str | None:
        return RegistrationService.verify_registration_otp(email, otp_code, request)

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
        return RegistrationService.finalize_signup(
            signup_token=signup_token,
            full_name=full_name,
            password=password,
            request=request
        )
