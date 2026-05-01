from __future__ import annotations

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TokenBlacklist",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("jti", models.CharField(db_index=True, max_length=64, unique=True)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={},
        ),
        migrations.CreateModel(
            name="AuthSession",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "session_id",
                    models.UUIDField(db_index=True, default=uuid.uuid4, unique=True),
                ),
                ("access_jti", models.CharField(db_index=True, max_length=64)),
                (
                    "refresh_jti",
                    models.CharField(db_index=True, max_length=64, unique=True),
                ),
                ("fingerprint", models.CharField(db_index=True, max_length=64)),
                ("device_label", models.CharField(max_length=255)),
                (
                    "device_entropy",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("started_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "last_seen_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        db_index=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="auth_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={},
        ),
        migrations.AddField(
            model_name="clientdevice",
            name="entropy_id",
            field=models.CharField(
                blank=True, db_index=True, default="", max_length=255
            ),
        ),
        migrations.AddField(
            model_name="clientdevice",
            name="last_seen_ip",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="tokenblacklist",
            index=models.Index(
                fields=["jti", "expires_at"], name="users_token_jti_2e7b77_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="authsession",
            index=models.Index(
                fields=["user", "is_active"], name="users_auths_user_id_9f0675_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="authsession",
            index=models.Index(
                fields=["user", "expires_at"], name="users_auths_user_id_22f6ba_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="authsession",
            index=models.Index(
                fields=["session_id", "user"], name="users_auths_session_13bf5f_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="authsession",
            index=models.Index(
                fields=["access_jti", "user"], name="users_auths_access__8d4f5e_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="clientdevice",
            index=models.Index(
                fields=["client", "entropy_id"], name="users_clien_client__680f4e_idx"
            ),
        ),
    ]
