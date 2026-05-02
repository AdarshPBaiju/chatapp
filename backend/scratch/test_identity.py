import os
import django

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
django.setup()

from users.models.clients.client import Client  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402

User = get_user_model()


def test_masked_email_population():
    # 1. Create a dummy user
    email = "test_masking@example.com"
    user, created = User.objects.get_or_create(email=email)

    # 2. Get or create Client
    client, created = Client.objects.get_or_create(
        user=user, defaults={"full_name": "Test Masking User"}
    )

    print(f"Client: {client.full_name}")
    print(f"Username: {client.username}")
    print(f"Masked Email: {client.masked_email}")
    print(f"Is Email Masked: {client.is_email_masked}")

    if client.masked_email:
        print("✅ Masked email populated successfully.")
    else:
        print("❌ Masked email NOT populated.")

    # 3. Verify determinism
    original_mask = client.masked_email
    client.masked_email = None  # Force clear
    client.save()

    if client.masked_email == original_mask:
        print("✅ Masked email is deterministic.")
    else:
        print(
            f"❌ Masked email changed! (Old: {original_mask}, New: {client.masked_email})"
        )


if __name__ == "__main__":
    test_masked_email_population()
