from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone

from authentication.core.crypto import AuthCryptoEngine
from authentication.core.request_context import (
    build_auth_request_context,
    build_fingerprint,
    parse_device_info,
)
from authentication.models import AuthSession, TokenBlacklist
from authentication.security.application.services import (
    OtpDeliveryService,
    OtpValidationService,
)
from authentication.identity.infrastructure.cache import RedisSessionStore
from authentication.sessions.application.services import (
    SessionManager,
    SessionQueryService,
)
from authentication.identity.application.services import TokenRotateService
from users.models import Client, CustomUser


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
        OtpDeliveryService.send_otp(self.user, ignore_cooldown=True)
        req = self.factory.post("/", HTTP_X_FORWARDED_FOR="1.1.1.1")
        self.assertFalse(OtpValidationService.validate_otp(str(self.user.id), "000000", request=req))

    def test_registration_otp_round_trip_uses_hashed_storage(self):
        otp = OtpDeliveryService.send_otp(self.user, ignore_cooldown=True)
        req = self.factory.post("/", HTTP_X_FORWARDED_FOR="2.2.2.2")
        self.assertTrue(OtpValidationService.validate_otp(str(self.user.id), otp, request=req))
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

    def test_brave_client_hint_overrides_chrome_browser_family(self):
        req = self.factory.get(
            "/",
            HTTP_USER_AGENT=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            ),
            HTTP_SEC_CH_UA='"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
        )

        device_label = parse_device_info(req)
        context = build_auth_request_context(req)

        self.assertEqual(device_label, "Brave on Linux")
        self.assertEqual(context.device_label, "Brave on Linux")

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

        with patch.object(RedisSessionStore, "sync_active_sessions"):
            sessions = SessionQueryService.list_active_sessions(
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
            with patch.object(RedisSessionStore, "sync_active_sessions"):
                result = TokenRotateService.refresh_tokens(
                    self.user,
                    {
                        "user_id": str(self.user.id),
                        "jti": "refresh-1",
                        "partner_jti": "access-1",
                        "sid": str(current_session.session_id),
                        "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
                    },
                    request,
                )

        self.assertEqual(result["status"], "restricted")
        self.assertEqual(len(result["active_sessions"]), 2)
        self.assertTrue(TokenBlacklist.objects.filter(jti="refresh-1").exists())

    def test_persist_session_coerces_null_geography_fields(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        session_id = str(uuid.uuid4())

        SessionManager.persist_session(
            user=self.user,
            session_id=session_id,
            access_jti="access-1",
            refresh_jti="refresh-1",
            fingerprint="fingerprint-1",
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            ip_address="127.0.0.1",
            expires_at=timezone.now() + timedelta(hours=1),
            location_data={"city": None, "country_code": None, "lat": None, "lon": None},
        )

        session = AuthSession.objects.get(user=self.user, session_id=session_id)
        self.assertEqual(session.city, "")
        self.assertEqual(session.country_code, "")

    def test_promote_restricted_session_upgrades_access(self):
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])
        request = self.factory.post(
            "/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.8",
            HTTP_X_TIMEZONE_OFFSET="-330",
            HTTP_X_DEVICE_ENTROPY="entropy-1",
            HTTP_X_FORWARDED_FOR="1.1.1.1",
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
            # Simulate a situation where we are exactly at the limit
            promoted = TokenRotateService.promote_restricted_session(
                user_id=str(self.user.id),
                access_jti="old-access",
                refresh_jti="old-refresh",
                request=request,
                session_id=str(session.session_id),
            )

        self.assertEqual(promoted["status"], "full")
        self.assertIn("access", promoted)
        self.assertIn("refresh", promoted)
        session.refresh_from_db()
        self.assertNotEqual(session.access_jti, "old-access")

    def test_refresh_tokens_requires_matching_session_id_and_refresh_jti(self):
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
        AuthSession.objects.create(
            user=self.user,
            access_jti="access-1",
            refresh_jti="refresh-1",
            fingerprint=fingerprint,
            device_label="Chrome on Linux",
            device_entropy="entropy-1",
            expires_at=timezone.now() + timedelta(hours=1),
        )

        with self.assertRaisesMessage(
            ValueError, "Session context not found or already revoked."
        ):
            TokenRotateService.refresh_tokens(
                self.user,
                {
                    "user_id": str(self.user.id),
                    "jti": "refresh-1",
                    "partner_jti": "access-1",
                    "sid": str(uuid.uuid4()),
                    "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
                },
                request,
            )
