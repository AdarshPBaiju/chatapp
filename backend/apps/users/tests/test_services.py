from django.test import TestCase
from unittest.mock import patch
from users.services.user_services import UserService
from users.models import CustomUser, Client
import pytest


class UserServiceTests(TestCase):
    @patch("users.services.user_services.RegistrationService.initiate_signup")
    def test_initiate_signup_delegation(self, mock_initiate):
        UserService.initiate_signup("test@example.com")
        mock_initiate.assert_called_once_with("test@example.com")

    @patch("users.services.user_services.OtpDeliveryService.send_otp")
    def test_create_user_success(self, mock_send_otp):
        data = {
            "full_name": "New User",
            "email": "new@example.com",
            "password": "StrongPassword123!",
        }
        user = UserService.create_user(data)

        self.assertEqual(user.email, "new@example.com")
        self.assertFalse(user.is_active)
        self.assertTrue(Client.objects.filter(user=user, full_name="New User").exists())
        mock_send_otp.assert_called_once()

    def test_create_user_duplicate_email(self):
        CustomUser.objects.create_user(email="dup@example.com", password="password")
        data = {
            "full_name": "Dup User",
            "email": "dup@example.com",
            "password": "StrongPassword123!",
        }
        from rest_framework.serializers import ValidationError

        with pytest.raises(ValidationError) as cm:
            UserService.create_user(data)

        self.assertIn("email", cm.value.detail)

    @patch("users.services.user_services.RecoveryService.request_password_reset")
    def test_request_password_reset_delegation(self, mock_request):
        UserService.request_password_reset("test@example.com")
        mock_request.assert_called_once_with("test@example.com")

    @patch("users.services.user_services.RecoveryService.verify_password_reset_otp")
    def test_verify_password_reset_otp_delegation(self, mock_verify):
        mock_verify.return_value = True
        res = UserService.verify_password_reset_otp("test@example.com", "123456")
        self.assertTrue(res)
        mock_verify.assert_called_once()
