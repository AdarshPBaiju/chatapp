from django.test import TestCase, RequestFactory, override_settings
from users.models import CustomUser, Client
from core.api.authentication import AdvancedJWTAuthentication
from authentication.core.crypto import AuthCryptoEngine
from rest_framework.exceptions import AuthenticationFailed
import uuid
from copy import deepcopy
from django.conf import settings


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
class SecurityInfraTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = CustomUser.objects.create_user(
            email="security@example.com", password="password123", is_active=True
        )
        Client.objects.create(user=self.user, full_name="Security Tester")
        self.auth = AdvancedJWTAuthentication()

    def test_advanced_jwt_auth_success(self):
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        user, auth_payload = self.auth.authenticate(request)
        self.assertEqual(user, self.user)
        self.assertEqual(auth_payload["sub"], str(self.user.id))

    def test_advanced_jwt_auth_no_header(self):
        request = self.factory.get("/")
        result = self.auth.authenticate(request)
        self.assertIsNone(result)

    def test_advanced_jwt_auth_invalid_token(self):
        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer invalid-token")
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(request)

    def test_advanced_jwt_auth_inactive_user(self):
        self.user.is_active = False
        self.user.save()

        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        with self.assertRaises(AuthenticationFailed) as cm:
            self.auth.authenticate(request)
        self.assertIn("inactive", str(cm.exception))
