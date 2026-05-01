from rest_framework.test import APITestCase
from rest_framework import status
from django.core import mail
from unittest.mock import patch
from users.models import CustomUser, Client
from django.core.cache import cache

from django.urls import reverse


class AuthFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.reg_init_url = reverse("signup-request")
        self.reg_verify_url = reverse("signup-verify")
        self.recovery_init_url = reverse("password-reset-request")
        self.recovery_verify_url = reverse("password-reset-verify")

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
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Check mail was sent
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("newuser@example.com", mail.outbox[0].to)

        # Extract OTP from mail (6 digits, possibly separated by whitespace/newlines)
        import re

        # Find all 6-digit numeric blocks in the body
        otp_matches = re.findall(r"\b\d{6}\b", mail.outbox[0].body)
        if not otp_matches:
            # Fallback for split digits
            all_digits = "".join(re.findall(r"\d", mail.outbox[0].body))
            otp = all_digits[:6]
        else:
            otp = otp_matches[0]
        self.assertEqual(len(otp), 6, "Could not extract 6-digit OTP from email")

        # 2. Verify
        response = self.client.post(
            self.reg_verify_url,
            {"email": "newuser@example.com", "otp_code": otp},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user = CustomUser.objects.get(email="newuser@example.com")
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_password_recovery_flow_success(self):
        user = CustomUser.objects.create_user(
            email="recover@example.com", password="old-password"
        )
        Client.objects.create(user=user, full_name="Recover User")

        # 1. Init
        response = self.client.post(
            self.recovery_init_url, {"email": "recover@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check mail
        self.assertGreaterEqual(len(mail.outbox), 1)
        self.assertIn("recover@example.com", [m.to[0] for m in mail.outbox])

        import re

        all_digits = "".join(re.findall(r"\d", mail.outbox[-1].body))
        otp = all_digits[:6]
        self.assertEqual(len(otp), 6, "Could not extract 6-digit recovery OTP")

        # 2. Verify and Reset
        response = self.client.post(
            self.recovery_verify_url,
            {
                "email": "recover@example.com",
                "otp": otp,
                "new_password": "NewStrongPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify login with new password
        self.assertTrue(user.check_password("NewStrongPass123!"))

    def test_registration_conflict_existing_user(self):
        # 1. Create existing active user
        CustomUser.objects.create_user(
            email="conflict@example.com", password="password", is_active=True
        )

        # 2. Request signup for same email (Should succeed/noop for security)
        response = self.client.post(
            self.reg_init_url, {"email": "conflict@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # 3. Verify OTP for existing email
        # We mock the OTP validation to succeed so we can test the account existence check
        with patch(
            "authentication.security.application.services.OtpValidationService.validate_otp",
            return_value=True,
        ):
            response = self.client.post(
                self.reg_verify_url,
                {"email": "conflict@example.com", "otp_code": "123456"},
                format="json",
            )

            # Should return 409 Conflict
            self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
            self.assertEqual(response.data["error_code"], "REGISTRATION_EMAIL_EXISTS")

    def test_full_registration_and_activation_flow(self):
        """
        Deep test covering the full 3-stage registration pipeline.
        """
        finalize_url = reverse("signup-finalize")

        # Stage 1: Request Signup
        response = self.client.post(
            self.reg_init_url, {"email": "full-flow@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Extract OTP from mail
        import re

        all_digits = "".join(re.findall(r"\d", mail.outbox[0].body))
        otp = all_digits[:6]

        # Stage 2: Verify OTP and get Signup Token
        response = self.client.post(
            self.reg_verify_url,
            {"email": "full-flow@example.com", "otp_code": otp},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        signup_token = response.data["data"]["signup_token"]
        self.assertIsNotNone(signup_token)

        # Stage 3: Finalize Account Creation
        response = self.client.post(
            finalize_url,
            {
                "signup_token": signup_token,
                "full_name": "Full Flow User",
                "password": "StrongPassword123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data["data"])
        self.assertIn("refresh", response.data["data"])

        # Verify database persistence
        user = CustomUser.objects.get(email="full-flow@example.com")
        self.assertTrue(user.is_active)
        self.assertEqual(user.client.full_name, "Full Flow User")
