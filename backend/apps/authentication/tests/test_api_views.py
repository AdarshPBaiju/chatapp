from rest_framework.test import APITestCase
from rest_framework import status
from django.test import override_settings
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

    def test_token_verify_success(self):
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)

        response = self.client.post(self.verify_url, {"token": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

    @patch("authentication.identity.interfaces.views.TokenRotateService.refresh_tokens")
    def test_token_refresh_success(self, refresh_mock):
        refresh_mock.return_value = {
            "status": "full",
            "access": "new-access",
            "refresh": "new-refresh",
            "access_exp": 123,
            "refresh_exp": 456,
        }

        # Valid refresh token payload
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "refresh",
            "sid": "session-1",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=3600)

        response = self.client.post(self.refresh_url, {"refresh": token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["access"], "new-access")
