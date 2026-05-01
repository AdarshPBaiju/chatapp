from rest_framework.test import APITestCase
from rest_framework import status
from django.core import mail
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
        # Find all digits and join them, then look for a 6-digit sequence
        all_digits = "".join(re.findall(r'\d', mail.outbox[0].body))
        # The OTP is usually the first or most prominent 6-digit block
        # Given the template, the first 6 digits will be the OTP
        otp = all_digits[:6]
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
        all_digits = "".join(re.findall(r'\d', mail.outbox[-1].body))
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
        # Create user first
        CustomUser.objects.create_user(
            email="conflict@example.com", password="password"
        )

        from rest_framework.exceptions import ValidationError
        from authentication.registration.application.services import RegistrationService

        # Attempt to init signup with same email
        with self.assertRaises(ValidationError) as cm:
            RegistrationService.initiate_signup(
                email="conflict@example.com",
            )
        self.assertIn("already exists", str(cm.exception))
