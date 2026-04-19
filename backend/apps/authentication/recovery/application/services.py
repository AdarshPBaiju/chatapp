import logging
from typing import Any

from django.db import transaction

from authentication.core.crypto import AuthCryptoEngine
from authentication.security.application.services import (
    OtpDeliveryService,
    OtpValidationService,
)
from users.models import CustomUser

logger = logging.getLogger("users")


class RecoveryService:
    @classmethod
    def request_password_reset(cls, email: str) -> None:
        user = CustomUser.objects.filter(email__iexact=email, is_active=True).first()
        OtpDeliveryService.send_otp(user=user, email=email, purpose="password_reset")

    @classmethod
    def verify_password_reset_otp(
        cls, email: str, otp_code: str, request: Any | None = None
    ) -> str | None:
        is_valid = OtpValidationService.validate_otp(
            identifier=email,
            otp_code=otp_code,
            request=request,
            purpose="password_reset",
            consume=True,
        )
        if not is_valid:
            return None

        user = CustomUser.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return None

        # Return a secure short-lived reset token
        payload = {
            "sub": str(user.id),
            "purpose": "password_reset",
            "email": user.email,
        }
        return AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=600)

    @classmethod
    @transaction.atomic
    def reset_password(cls, reset_token: str, new_password: str) -> bool:
        try:
            payload = AuthCryptoEngine.decrypt_and_verify(reset_token)
            if payload.get("purpose") != "password_reset":
                return False

            user = CustomUser.objects.get(id=payload["sub"], is_active=True)
            user.set_password(new_password)
            user.save(update_fields=["password"])

            from authentication.sessions.application.services import SessionManager

            SessionManager.revoke_all_sessions(str(user.id))
        except Exception:
            return False
        else:
            return True
