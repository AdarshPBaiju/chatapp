from __future__ import annotations

from typing import Any

from django.conf import settings

from authentication.sessions.infrastructure.models import AuthSession


class DeviceRegistryService:
    @staticmethod
    def get_device_limit() -> int:
        """
        Returns the maximum number of concurrent active sessions allowed per user.
        Deflects to settings for centralized configuration.
        """
        return settings.AUTH_ENGINE_SETTINGS.get("MAX_DEVICES_PER_USER", 5)

    @classmethod
    def sync_device_registry(cls, user: Any, context: Any) -> None:
        """
        Keeps device-scoped session metadata consistent for the current request
        context inside the active session table.
        """
        AuthSession.objects.filter(
            user=user,
            fingerprint=context.fingerprint,
            device_entropy=context.device_entropy,
            is_active=True,
        ).update(
            device_label=context.device_label,
            ip_address=context.ip_address,
        )
