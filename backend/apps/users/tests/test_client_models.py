from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from users.models import (
    CustomUser,
    Client,
    ClientBanRecord,
    ClientAccountSuspension,
    ClientDevice,
)
import pytest


class ClientModelTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="test@example.com", password="testpassword123", is_active=True
        )
        self.client_obj = Client.objects.create(user=self.user, full_name="Test Client")

    def test_client_is_banned_property(self):
        self.assertFalse(self.client_obj.is_banned)

        ban = ClientBanRecord.objects.create(
            client=self.client_obj,
            reason_to_ban="Spamming",
            ban_type=ClientBanRecord.BanType.PERMANENT,
            is_active=True,
        )
        self.assertTrue(self.client_obj.is_banned)
        self.assertEqual(ban.current_status, "active")

        ban.revoke(reason="Mistake")
        self.assertFalse(self.client_obj.is_banned)
        self.assertEqual(ban.current_status, "revoked")
        self.assertEqual(ban.reason_to_unban, "Mistake")

    def test_client_is_suspended_property(self):
        self.assertFalse(self.client_obj.is_suspended)

        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            reason=ClientAccountSuspension.SuspensionReason.SPAM,
            status=ClientAccountSuspension.SuspensionStatus.ACTIVE,
            ends_at=timezone.now() + timedelta(days=1),
        )
        self.assertTrue(self.client_obj.is_suspended)
        self.assertTrue(suspension.is_active)

        suspension.lift(reason="Good behavior")
        self.assertFalse(self.client_obj.is_suspended)
        self.assertFalse(suspension.is_active)
        self.assertEqual(
            suspension.status, ClientAccountSuspension.SuspensionStatus.LIFTED
        )

    def test_client_suspension_expiration(self):
        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            reason=ClientAccountSuspension.SuspensionReason.OTHER,
            status=ClientAccountSuspension.SuspensionStatus.ACTIVE,
            ends_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(suspension.is_active)
        self.assertEqual(suspension.current_status, "expired")

    def test_client_device_creation(self):
        device = ClientDevice.objects.create(
            client=self.client_obj,
            device_id="device-123",
            device_type="web",
            device_name="Chrome on Linux",
        )
        self.assertEqual(str(device), "Chrome on Linux (Test Client)")
        self.assertTrue(device.is_active)

    def test_client_suspension_extension(self):
        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            reason=ClientAccountSuspension.SuspensionReason.SPAM,
            status=ClientAccountSuspension.SuspensionStatus.ACTIVE,
            ends_at=timezone.now() + timedelta(days=1),
        )
        old_end = suspension.ends_at
        new_end = old_end + timedelta(days=5)

        suspension.extend(new_end, reason="Further violations")

        self.assertEqual(suspension.ends_at, new_end)
        self.assertIn("Further violations", suspension.details)

    def test_model_string_representations(self):
        self.assertEqual(str(self.user), "test@example.com (User)")
        self.assertEqual(str(self.client_obj), "Test Client (test@example.com)")

    def test_ban_current_status_permanent(self):
        ban = ClientBanRecord.objects.create(
            client=self.client_obj,
            reason_to_ban="Abuse",
            ban_type=ClientBanRecord.BanType.PERMANENT,
            is_active=True,
        )
        self.assertEqual(ban.current_status, "active")

    def test_ban_current_status_expired(self):
        ban = ClientBanRecord.objects.create(
            client=self.client_obj,
            reason_to_ban="Temp",
            ban_type=ClientBanRecord.BanType.TEMPORARY,
            is_active=True,
            end_at=timezone.now() - timedelta(minutes=1),
        )
        self.assertEqual(ban.current_status, "expired")

    def test_client_backup_codes(self):
        codes = self.client_obj.generate_and_set_backup_codes()
        self.assertEqual(len(codes), 10)
        self.client_obj.refresh_from_db()
        self.assertEqual(len(self.client_obj.backup_codes), 10)
        first_code = codes[0]
        self.assertTrue(self.client_obj.verify_and_burn_backup_code(first_code))
        self.client_obj.refresh_from_db()
        self.assertEqual(len(self.client_obj.backup_codes), 9)

        self.assertFalse(self.client_obj.verify_and_burn_backup_code("wrong-code"))

    def test_suspension_default_ends_at(self):
        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            reason=ClientAccountSuspension.SuspensionReason.FRAUD,
        )
        self.assertIsNotNone(suspension.ends_at)
        self.assertTrue(suspension.ends_at > timezone.now() + timedelta(days=6))

    def test_suspension_lift_inactive_error(self):
        from users.exceptions import InactiveSuspensionError

        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            status=ClientAccountSuspension.SuspensionStatus.LIFTED,
        )
        with pytest.raises(InactiveSuspensionError):
            suspension.lift(reason="Already lifted")

    def test_suspension_extend_inactive_error(self):
        from users.exceptions import InactiveSuspensionError

        suspension = ClientAccountSuspension.objects.create(
            client=self.client_obj,
            status=ClientAccountSuspension.SuspensionStatus.EXPIRED,
        )
        with pytest.raises(InactiveSuspensionError):
            suspension.extend(timezone.now() + timedelta(days=1))
