from django.test import TestCase, RequestFactory, override_settings
from unittest.mock import Mock, patch
from users.models import CustomUser, Client
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from core.api.authentication import AdvancedJWTAuthentication
from core.api.responses import ResponseFactory
from core.api.exceptions import api_exception_handler
from authentication.core.crypto import AuthCryptoEngine
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


def _go_auth_settings_override(**overrides) -> dict:
    settings_dict = {
        "ENABLED": False,
        "VERIFY_URL": "http://go-auth:8080/api/v1/verify",
        "INTERNAL_SERVICE_SECRET": "test-internal-secret",
        "TIMEOUT_SECONDS": 2.0,
        "FALLBACK_TO_LOCAL": True,
    }
    settings_dict.update(overrides)
    return settings_dict


@override_settings(
    AUTH_ENGINE_SETTINGS=_auth_settings_override(),
)
class SecurityInfraTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="security@example.com", password="password123", is_active=True
        )
        self.client_obj = Client.objects.create(
            user=self.user, full_name="Security Tester"
        )
        self.factory = RequestFactory()
        self.auth = AdvancedJWTAuthentication()

    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    def test_advanced_jwt_auth_success(self, build_fpt_mock_ctx, build_fpt_mock_val):
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
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        user, auth_payload = self.auth.authenticate(request)
        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_payload["sub"], payload["sub"])

    def test_advanced_jwt_auth_no_header(self):
        request = self.factory.get("/")
        result = self.auth.authenticate(request)
        self.assertIsNone(result)

    def test_advanced_jwt_auth_invalid_token(self):
        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer invalid-token")
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(request)

    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    def test_advanced_jwt_auth_inactive_user(
        self, build_fpt_mock_ctx, build_fpt_mock_val
    ):
        build_fpt_mock_ctx.return_value = "fixed-fpt"
        build_fpt_mock_val.return_value = "fixed-fpt"
        self.user.is_active = False
        self.user.save()

        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        with self.assertRaises(AuthenticationFailed) as cm:
            self.auth.authenticate(request)
        self.assertIn("inactive", str(cm.exception))

    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    def test_advanced_jwt_auth_revoke_only_scope(
        self, build_fpt_mock_ctx, build_fpt_mock_val
    ):
        build_fpt_mock_ctx.return_value = "fixed-fpt"
        build_fpt_mock_val.return_value = "fixed-fpt"
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "revoke_only",
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        _user, auth_payload = self.auth.authenticate(request)
        self.assertEqual(auth_payload["scope"], "revoke_only")

    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    @patch("authentication.core.token_validator.SessionQueryService.is_session_active")
    def test_advanced_jwt_auth_inactive_session(
        self, is_active_mock, build_fpt_mock_ctx, build_fpt_mock_val
    ):
        is_active_mock.return_value = False
        build_fpt_mock_ctx.return_value = "fixed-fpt"
        build_fpt_mock_val.return_value = "fixed-fpt"
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "sid": str(uuid.uuid4()),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        with self.assertRaises(AuthenticationFailed) as cm:
            self.auth.authenticate(request)
        self.assertIn("Session is no longer active", str(cm.exception))

    def test_advanced_jwt_auth_authenticate_header(self):
        header = self.auth.authenticate_header(None)
        self.assertEqual(header, "Bearer")

    @override_settings(
        GO_AUTH_SETTINGS=_go_auth_settings_override(ENABLED=True),
    )
    @patch("authentication.core.token_validator.requests.post")
    def test_advanced_jwt_auth_uses_go_auth_when_available(self, post_mock):
        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
            "fpt": "remote-fpt",
        }
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            "status": "ok",
            "message": "verified",
            "data": {"payload": payload},
        }
        post_mock.return_value = response

        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer remote-token")

        with patch(
            "authentication.core.token_validator.AuthCryptoEngine.decrypt_and_verify"
        ) as decrypt_mock:
            user, auth_payload = self.auth.authenticate(request)

        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_payload["user_id"], str(self.user.id))
        decrypt_mock.assert_not_called()
        post_mock.assert_called_once()

    @override_settings(
        GO_AUTH_SETTINGS=_go_auth_settings_override(ENABLED=True),
    )
    @patch("authentication.core.token_validator.build_fingerprint")
    @patch("authentication.core.request_context.build_fingerprint")
    @patch("authentication.core.token_validator.requests.post")
    def test_advanced_jwt_auth_falls_back_when_go_auth_not_implemented(
        self,
        post_mock,
        build_fpt_mock_ctx,
        build_fpt_mock_val,
    ):
        build_fpt_mock_ctx.return_value = "fixed-fpt"
        build_fpt_mock_val.return_value = "fixed-fpt"
        response = Mock()
        response.status_code = 501
        response.json.return_value = {
            "status": "error",
            "message": "not implemented",
            "error_code": "GO_AUTH_VERIFY_NOT_IMPLEMENTED",
        }
        post_mock.return_value = response

        payload = {
            "sub": str(self.user.id),
            "user_id": str(self.user.id),
            "jti": str(uuid.uuid4()),
            "type": "access",
            "scope": "full",
            "fpt": "fixed-fpt",
        }
        token = AuthCryptoEngine.encrypt_and_sign(payload, ttl_seconds=60)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        user, auth_payload = self.auth.authenticate(request)

        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_payload["sub"], payload["sub"])
        post_mock.assert_called_once()

    @override_settings(
        GO_AUTH_SETTINGS=_go_auth_settings_override(ENABLED=True),
    )
    @patch("authentication.core.token_validator.requests.post")
    def test_advanced_jwt_auth_raises_go_validation_failure(self, post_mock):
        response = Mock()
        response.status_code = 401
        response.json.return_value = {
            "status": "error",
            "message": "Token context mismatch.",
            "error_code": "AUTH_TOKEN_TAMPERED",
        }
        post_mock.return_value = response

        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer remote-token")

        with self.assertRaises(AuthenticationFailed) as cm:
            self.auth.authenticate(request)

        self.assertIn("Token context mismatch", str(cm.exception))
        post_mock.assert_called_once()


class CoreAPITests(TestCase):
    def test_response_factory_success(self):
        response = ResponseFactory.success(message="Yay", data={"key": "val"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["key"], "val")

    def test_response_factory_error(self):
        response = ResponseFactory.error(message="Noo", errors={"field": "err"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["errors"]["field"], "err")

    def test_exception_handler_django_validation_error(self):
        from django.core.exceptions import ValidationError as DjangoValidationError

        exc = DjangoValidationError({"email": ["Invalid"]})
        response = api_exception_handler(exc, None)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["errors"]["email"], ["Invalid"])

    def test_exception_handler_drf_error(self):
        exc = ValidationError({"detail": "DRF Error"})
        response = api_exception_handler(exc, None)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["message"], "DRF Error")
