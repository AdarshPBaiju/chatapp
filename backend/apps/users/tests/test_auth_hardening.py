from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
import uuid
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.test.client import RequestFactory
from django.utils import timezone

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import build_auth_request_context, build_fingerprint
from users.models import AuthSession, Client, CustomUser, TokenBlacklist
from users.services.auth_engine import AuthEngine
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

    def test_list_active_sessions_marks_current_device_by_entropy(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        request = self.factory.get(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
            HTTP_X_DEVICE_ENTROPY="entropy-1",
        )
        fingerprint = build_fingerprint(request, device_entropy="entropy-1")
        AuthSession.objects.create(
            user=self.user,
            access_jti="access-1",
            refresh_jti="refresh-1",
            fingerprint=fingerprint,
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            expires_at=timezone.now() + timedelta(hours=1),
            city="Bengaluru",
            country_code="IN",
        )

        with patch.object(AuthEngine, "_hydrate_session_to_redis"):
            sessions = AuthEngine.list_active_sessions(
                user_id=str(self.user.id),
                current_sid="ephemeral-sid",
                current_access_jti="ephemeral-jti",
                current_fingerprint=fingerprint,
                current_device_entropy="entropy-1",
            )

        self.assertEqual(len(sessions), 1)
        self.assertTrue(sessions[0]["is_current"])
        self.assertEqual(sessions[0]["city"], "Bengaluru")
        self.assertEqual(sessions[0]["country_code"], "IN")

    def test_refresh_tokens_returns_restricted_state_when_active_sessions_exceed_limit(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        request = self.factory.post(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
            HTTP_X_DEVICE_ENTROPY="entropy-1",
        )
        fingerprint = build_fingerprint(request, device_entropy="entropy-1")
        current_session = AuthSession.objects.create(
            user=self.user,
            access_jti="access-1",
            refresh_jti="refresh-1",
            fingerprint=fingerprint,
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            expires_at=timezone.now() + timedelta(hours=1),
        )
        AuthSession.objects.create(
            user=self.user,
            access_jti="access-2",
            refresh_jti="refresh-2",
            fingerprint="other-fingerprint",
            device_label="Safari on iPhone",
            device_entropy="entropy-2",
            expires_at=timezone.now() + timedelta(hours=1),
        )

        with self.settings(
            AUTH_ENGINE_SETTINGS={
                **settings.AUTH_ENGINE_SETTINGS,
                "MAX_DEVICES_PER_USER": 1,
            }
        ):
            with patch.object(AuthEngine, "_hydrate_session_to_redis"):
                result = AuthEngine.refresh_tokens(
                    self.user,
                    {
                        "jti": "refresh-1",
                        "partner_jti": "access-1",
                        "sid": str(current_session.session_id),
                        "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
                    },
                    request,
                )

        self.assertEqual(result["status"], "restricted")
        self.assertEqual(len(result["active_sessions"]), 2)
        self.assertTrue(
            any(
                session["session_id"] == str(current_session.session_id)
                and session["is_current"]
                for session in result["active_sessions"]
            )
        )
        self.assertTrue(TokenBlacklist.objects.filter(jti="refresh-1").exists())

    def test_build_restricted_response_accepts_location_keyword(self):
        request = self.factory.post(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
            HTTP_X_DEVICE_ENTROPY="entropy-1",
        )
        context = build_auth_request_context(request)

        with patch.object(AuthEngine, "list_active_sessions", return_value=[]):
            result = AuthEngine._build_restricted_response(
                user_id=str(self.user.id),
                context=context,
                access_jti="new-access",
                refresh_jti="new-refresh",
                session_id="session-1",
                location={"city": None, "country_code": None, "lat": None, "lon": None},
            )

        self.assertEqual(result["status"], "restricted")
        self.assertIn("access", result)

    def test_persist_session_coerces_null_geography_fields(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        session_id = str(uuid.uuid4())

        AuthEngine._persist_session(
            user=self.user,
            session_id=session_id,
            access_jti="access-1",
            refresh_jti="refresh-1",
            fingerprint="fingerprint-1",
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            ip_address="127.0.0.1",
            expires_at=timezone.now() + timedelta(hours=1),
            city=None,
            country_code=None,
            latitude=None,
            longitude=None,
        )

        session = AuthSession.objects.get(user=self.user, session_id=session_id)
        self.assertEqual(session.city, "")
        self.assertEqual(session.country_code, "")

    def test_promote_restricted_session_reuses_current_active_session(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        request = self.factory.post(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
            HTTP_X_DEVICE_ENTROPY="entropy-1",
        )
        fingerprint = build_fingerprint(request, device_entropy="entropy-1")
        session = AuthSession.objects.create(
            user=self.user,
            access_jti="old-access",
            refresh_jti="old-refresh",
            fingerprint=fingerprint,
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            expires_at=timezone.now() + timedelta(hours=1),
        )

        with self.settings(
            AUTH_ENGINE_SETTINGS={
                **settings.AUTH_ENGINE_SETTINGS,
                "MAX_DEVICES_PER_USER": 1,
            }
        ):
            with patch.object(AuthEngine, "_update_session_in_redis", return_value="SUCCESS"):
                promoted = AuthEngine.promote_restricted_session(
                    user_id=str(self.user.id),
                    access_jti="new-access",
                    refresh_jti="new-refresh",
                    request=request,
                    session_id=str(session.session_id),
                )

        session.refresh_from_db()
        self.assertIn("access", promoted)
        self.assertIn("refresh", promoted)
        self.assertEqual(session.access_jti, "new-access")
        self.assertEqual(session.refresh_jti, "new-refresh")
        self.assertEqual(AuthSession.objects.filter(user=self.user).count(), 1)
