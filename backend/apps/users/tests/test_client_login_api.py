from __future__ import annotations

from copy import deepcopy
from unittest.mock import patch

from django.conf import settings
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

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
            "LOCATION": "client-login-api-tests",
        }
    },
)
class ClientLoginAPITests(APITestCase):
    endpoint = "/api/v1/auth/identity/login/"
    identity_init_endpoint = "/api/v1/auth/identity/init/"

    def setUp(self):
        self.inactive_user = CustomUser.objects.create_user(
            email="inactive@example.com",
            password="StrongPass123!",
            is_active=False,
        )
        Client.objects.create(user=self.inactive_user, full_name="Inactive User")

        self.active_user = CustomUser.objects.create_user(
            email="active@example.com",
            password="StrongPass123!",
            is_active=True,
        )
        Client.objects.create(user=self.active_user, full_name="Active User")

    def test_invalid_credentials_return_unauthorized(self):
        response = self.client.post(
            self.endpoint,
            {"email": "active@example.com", "password": "WrongPass"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(response.data["success"])

    @patch("authentication.identity.interfaces.views.OtpDeliveryService.send_otp")
    def test_inactive_user_login_auto_sends_otp(self, send_otp_mock):
        response = self.client.post(
            self.endpoint,
            {"email": "inactive@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["status"], "pending_verification")
        self.assertEqual(response.data["data"]["user_id"], str(self.inactive_user.id))
        send_otp_mock.assert_called_once_with(self.inactive_user, ignore_cooldown=True)

    @patch("authentication.identity.interfaces.views.LoginService.issue_tokens")
    def test_active_user_login_returns_full_tokens(self, issue_tokens_mock):
        issue_tokens_mock.return_value = {
            "status": "full",
            "access": "access-token",
            "refresh": "refresh-token",
            "access_exp": 111,
            "refresh_exp": 222,
            "session_id": "session-id",
        }

        response = self.client.post(
            self.endpoint,
            {"email": "active@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertFalse(response.data["data"]["is_restricted"])
        self.assertEqual(response.data["data"]["access"], "access-token")
        self.assertEqual(response.data["data"]["refresh"], "refresh-token")

    @patch("authentication.identity.interfaces.views.LoginService.issue_tokens")
    def test_active_user_login_returns_restricted_payload(self, issue_tokens_mock):
        issue_tokens_mock.return_value = {
            "status": "restricted",
            "access": "access-token",
            "refresh": "refresh-token",
            "access_exp": 111,
            "refresh_exp": 222,
            "active_sessions": [{"session_id": "s1"}],
            "message": "Maximum device limit reached. Please revoke an existing session to continue.",
        }

        response = self.client.post(
            self.endpoint,
            {"email": "active@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["data"]["is_restricted"])
        self.assertEqual(
            response.data["data"]["active_sessions"], [{"session_id": "s1"}]
        )

    def test_identity_init_route_is_registered(self):
        # Even for missing users, we return 200 with challenge_required to prevent enumeration
        response = self.client.post(
            self.identity_init_endpoint,
            {"email": "missing@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["status"], "challenge_required")
