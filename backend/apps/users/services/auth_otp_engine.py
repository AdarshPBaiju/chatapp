from __future__ import annotations

from typing import Any
import hmac
import hashlib
import time
import pyotp

from django.conf import settings


class AuthOtpEngine:
    """
    Implements a completely DB-stateless HMAC strategy for One-Time Passwords.
    Keys are strictly derived from epochs, flows, and the server's master secret,
    guaranteeing resistance to race conditions and temporal database-leak attacks.
    """

    @classmethod
    def generate_email_otp(
        cls, email: str, flow_id: str, window_offset: int = 0
    ) -> str:
        """
        Generates a 6-digit numeric string locked into a 2-minute sliding epoch.
        """
        # Epoch sliced into 120-second (2 minute) absolute intervals
        window = int(time.time() / 120) + window_offset
        message = f"{email}:{flow_id}:{window}".encode()
        secret_key = settings.SECRET_KEY.encode()

        digest = hmac.new(secret_key, message, hashlib.sha256).hexdigest()
        return str(int(digest[:8], 16) % 1000000).zfill(6)

    @classmethod
    def verify_email_otp(cls, email: str, flow_id: str, submitted_code: str) -> bool:
        """
        Checks the submitted code against the current window, and optionally the
        immediately preceding window to comfortably accommodate clock drift or network lag.
        """
        if not submitted_code or len(submitted_code) != 6:
            return False

        # Check current and trailing temporal windows to accommodate clock drift smoothly
        return hmac.compare_digest(
            cls.generate_email_otp(email, flow_id, window_offset=0), submitted_code
        ) or hmac.compare_digest(
            cls.generate_email_otp(email, flow_id, window_offset=-1), submitted_code
        )

    @classmethod
    def verify_totp(cls, client_instance: Any, submitted_code: str) -> bool:
        """
        Verifies a 6-digit TOTP code against the client's registered secret.
        """
        if not client_instance.totp_secret or not submitted_code:
            return False

        totp = pyotp.TOTP(client_instance.totp_secret)
        # Use a 1-interval window to tolerate slight clock drift gracefully
        return totp.verify(submitted_code, valid_window=1)

    @classmethod
    def verify_and_burn_backup_code(
        cls, client_instance: Any, submitted_code: str
    ) -> bool:
        """
        Checks if the submitted code matches the client's hashed backup list.
        If found, it is PERMANENTLY removed (Single-use burn).
        """
        if not submitted_code or not client_instance.backup_codes:
            return False

        return client_instance.verify_and_burn_backup_code(submitted_code)
