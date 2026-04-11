from __future__ import annotations

from copy import deepcopy

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.test.client import RequestFactory

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import build_fingerprint
from users.models import Client, CustomUser
from users.services.user_services import UserService


def _auth_settings_override() -> dict:
    auth_settings = deepcopy(settings.AUTH_ENGINE_SETTINGS)
    auth_settings["TOKEN_KEYRING"] = {
        "v1": {
            "signing_seed": "test-signing-seed",
            "encryption_key": "test-encryption-key",
        }
    }
    auth_settings["ACTIVE_KID"] = "v1"
    auth_settings["OTP_HASH_SECRET"] = "test-otp-secret"
    return auth_settings


@override_settings(
    AUTH_ENGINE_SETTINGS=_auth_settings_override(),
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "auth-hardening-tests",
        }
    },
)
class AuthHardeningTests(TestCase):
    def setUp(self):
        cache.clear()
        self.factory = RequestFactory()
        self.user = CustomUser.objects.create_user(
            email="hardening@example.com",
            password="StrongPass123!",
            is_active=False,
        )
        Client.objects.create(user=self.user, full_name="Hardening Tester")

    def test_registration_otp_not_bypassed_for_non_2fa_profile(self):
        UserService.send_otp(self.user, ignore_cooldown=True)
        req = self.factory.post("/", HTTP_X_FORWARDED_FOR="1.1.1.1")
        self.assertFalse(UserService.validate_otp(self.user, "000000", request=req))

    def test_registration_otp_round_trip_uses_hashed_storage(self):
        otp = UserService.send_otp(self.user, ignore_cooldown=True)
        req = self.factory.post("/", HTTP_X_FORWARDED_FOR="2.2.2.2")
        self.assertTrue(UserService.validate_otp(self.user, otp, request=req))
        self.assertIsNone(cache.get(f"otp:{self.user.id}:registration"))

    def test_fingerprint_includes_device_entropy(self):
        req = self.factory.get(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
        )
        fpt_without_entropy = build_fingerprint(req, device_entropy="")
        fpt_with_entropy = build_fingerprint(req, device_entropy="entropy-token")
        self.assertNotEqual(fpt_without_entropy, fpt_with_entropy)

    def test_crypto_round_trip_preserves_sid(self):
        token = AuthCryptoEngine.encrypt_and_sign(
            {
                "user_id": str(self.user.id),
                "jti": "a1",
                "partner_jti": "b1",
                "sid": "session-1",
                "fpt": "fingerprint-1",
                "type": "access",
                "scope": "full",
            },
            ttl_seconds=60,
        )
        payload = AuthCryptoEngine.decrypt_and_verify(token)
        self.assertEqual(payload["sid"], "session-1")
