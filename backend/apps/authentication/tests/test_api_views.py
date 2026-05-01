from rest_framework.test import APITestCase
from rest_framework import status
from django.test import override_settings
from unittest import TestCase
from users.models import CustomUser, Client
from authentication.core.crypto import AuthCryptoEngine
from unittest.mock import patch
from copy import deepcopy
from django.conf import settings
import uuid


def _auth_settings_override() -> dict:
    auth_settings = deepcopy(settings.AUTH_ENGINE_SETTINGS)
    auth_settings["TOKEN_KEYRING"] = {
        "v1": {
            "signing_seed": "test-signing-seed",
            "encryption_key": "test-encryption-key",
        }
    }
    auth_settings["ACTIVE_KID"] = "v1"
    return auth_settings


@override_settings(AUTH_ENGINE_SETTINGS=_auth_settings_override())
class AuthenticationAPIViewTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="api@example.com", password="StrongPass123!", is_active=True
        )
        self.client_obj = Client.objects.create(user=self.user, full_name="API Tester")
        self.challenge_url = "/api/v1/auth/identity/challenge/"
        self.verify_url = "/api/v1/auth/identity/token/verify/"
        self.refresh_url = "/api/v1/auth/identity/token/refresh/"

    @patch("authentication.identity.interfaces.views.HitEngine.verify_and_advance_hit")
    def test_challenge_password_success(self, verify_hit_mock):
        verify_hit_mock.return_value = {
            "sub": str(self.user.id),
            "flow_id": "flow-123",
            "step_counter": 1,
            "amr": [],
            "acr": 0,
        }

        response = self.client.post(
            self.challenge_url,
            {
                "hit": "fake-hit-token",
                "method": "password",
                "password": "StrongPass123!",
                "expected_step": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertEqual(response.data["data"]["user"]["email"], self.user.email)

    @patch("authentication.identity.interfaces.views.HitEngine.verify_and_advance_hit")
    def test_challenge_password_failure(self, verify_hit_mock):
        verify_hit_mock.return_value = {
            "sub": str(self.user.id),
            "flow_id": "flow-123",
            "step_counter": 1,
            "amr": [],
            "acr": 0,
        }

        response = self.client.post(
            self.challenge_url,
            {
                "hit": "fake-hit-token",
                "method": "password",
                "password": "WrongPassword",
                "expected_step": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["error_code"], "IDENTITY_INVALID_CREDENTIALS")

    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    def test_token_verify_success(self, build_fpt_mock_ctx, build_fpt_mock_val):
        build_fpt_mock_ctx.return_value = "fixed-fpt"
        build_fpt_mock_val.return_value = "fixed-fpt"
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)

        response = self.client.post(self.verify_url, {"token": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

    @patch("authentication.identity.interfaces.views.validate_token_for_request")
    @patch("authentication.identity.interfaces.views.TokenRotateService.refresh_tokens")
    def test_token_refresh_success(self, refresh_mock, validate_token_mock):
        session_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        validate_token_mock.return_value = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": jti,
            "partner_jti": str(uuid.uuid4()),
            "type": "refresh",
            "sid": session_id,
            "scope": "full",
            "fpt": "fixed-fpt",
        }
        refresh_mock.return_value = {
            "status": "full",
            "access": "new-access",
            "refresh": "new-refresh",
            "access_exp": 123,
            "refresh_exp": 456,
        }

        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": jti,
            "type": "refresh",
            "sid": session_id,
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=3600)

        response = self.client.post(self.refresh_url, {"refresh": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["access"], "new-access")


class CryptoTests(APITestCase):
    @override_settings(AUTH_ENGINE_SETTINGS=_auth_settings_override())
    def test_crypto_tampering_detection(self):
        payload = {"sub": "123"}
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)

        # Tamper with the token (change a character in the encrypted part)
        tampered_token = token[:-5] + ("A" if token[-5] != "A" else "B") + token[-4:]

        with TestCase().assertRaisesRegex(
            ValueError, "Invalid or tampered token protocol"
        ):
            AuthCryptoEngine.decrypt_and_verify(tampered_token)

    @override_settings(AUTH_ENGINE_SETTINGS=_auth_settings_override())
    def test_crypto_expired_token(self):
        payload = {"sub": "123"}
        # Issue token with negative TTL
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=-10)

        with TestCase().assertRaisesRegex(
            ValueError, "The authentication token has expired"
        ):
            AuthCryptoEngine.decrypt_and_verify(token)
