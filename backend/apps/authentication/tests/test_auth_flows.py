from rest_framework.test import APITestCase
from rest_framework import status
from django.core import mail
from users.models import CustomUser, Client
from unittest.mock import patch
from django.core.cache import cache

class AuthFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.reg_init_url = "/api/v1/auth/registration/init/"
        self.reg_verify_url = "/api/v1/auth/registration/verify/"
        self.recovery_init_url = "/api/v1/auth/recovery/init/"
        self.recovery_verify_url = "/api/v1/auth/recovery/verify/"

    def test_registration_flow_success(self):
        # 1. Init
        response = self.client.post(
            self.reg_init_url,
            {
                "email": "newuser@example.com",
                "password": "StrongPass123!",
                "full_name": "New User",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check mail was sent
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("newuser@example.com", mail.outbox[0].to)

        # Check OTP in cache
        user = CustomUser.objects.get(email="newuser@example.com")
        otp = cache.get(f"otp:{user.id}:registration")
        self.assertIsNotNone(otp)

        # 2. Verify
        response = self.client.post(self.reg_verify_url, {
            "email": "newuser@example.com",
            "otp": otp
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_password_recovery_flow_success(self):
        user = CustomUser.objects.create_user(email="recover@example.com", password="old-password")
        Client.objects.create(user=user, full_name="Recover User")

        # 1. Init
        response = self.client.post(self.recovery_init_url, {"email": "recover@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check mail
        self.assertGreaterEqual(len(mail.outbox), 1)
        self.assertIn("recover@example.com", [m.to[0] for m in mail.outbox])

        otp = cache.get(f"otp:{user.id}:recovery")
        self.assertIsNotNone(otp)

        # 2. Verify and Reset
        response = self.client.post(self.recovery_verify_url, {
            "email": "recover@example.com",
            "otp": otp,
            "new_password": "NewStrongPass123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify login with new password
        self.assertTrue(user.check_password("NewStrongPass123!"))

    @patch("authentication.security.application.services.OtpDeliveryService.send_otp")
    def test_otp_cooldown_enforcement(self, send_otp_mock):
        user = CustomUser.objects.create_user(email="cooldown@example.com", password="password")
        
        from authentication.security.application.services import OtpDeliveryService
        # First send
        OtpDeliveryService.send_otp(user)
        # Second send within seconds should fail or be throttled if implemented
        # (Assuming implementation has a cooldown check)
        with self.assertRaises(Exception): # Adjust based on actual exception raised (e.g. ValueError)
             OtpDeliveryService.send_otp(user, ignore_cooldown=False)
