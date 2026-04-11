from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.core.cache import cache

from core.auth.crypto import AuthCryptoEngine

if TYPE_CHECKING:
    from users.models import CustomUser


class AuthEngine:
    """
    Advanced Redis-centric authentication service.
    Manages token issuance, concurrency limits, and stateful revocation without DB pressure.
    """

    @classmethod
    def issue_tokens(cls, user: CustomUser, request: Any) -> dict[str, str]:
        """
        Creates a new elite session, enforces concurrent device limits,
        and returns a JWE-encrypted token pair.
        """
        user_id = str(user.id)
        active_key = f"auth:active_sessions:{user_id}"

        now_ts = int(datetime.now(UTC).timestamp())
        conn = cache.client.get_client()
        conn.zremrangebyscore(active_key, "-inf", now_ts)

        max_devices = settings.AUTH_ENGINE_SETTINGS["MAX_DEVICES_PER_USER"]
        if conn.zcard(active_key) >= max_devices:
            oldest = conn.zpopmin(active_key)
            if oldest:
                old_meta = json.loads(oldest[0].decode())
                cls.blacklist_tokens([old_meta["access_jti"], old_meta["refresh_jti"]])

        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())
        fingerprint = AuthCryptoEngine.generate_fingerprint(request)

        refresh_expiry = (
            now_ts + settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )

        access_token = AuthCryptoEngine.encrypt_and_sign(
            payload={
                "user_id": user_id,
                "jti": access_jti,
                "refresh_jti": refresh_jti,
                "fpt": fingerprint,
                "type": "access",
            },
            ttl_seconds=settings.AUTH_ENGINE_SETTINGS["ACCESS_TOKEN_LIFETIME"],
        )

        refresh_token = AuthCryptoEngine.encrypt_and_sign(
            payload={
                "user_id": user_id,
                "jti": refresh_jti,
                "access_jti": access_jti,
                "fpt": fingerprint,
                "type": "refresh",
            },
            ttl_seconds=settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"],
        )

        session_meta = {
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "ip": request.META.get("REMOTE_ADDR"),
            "ua": request.META.get("HTTP_USER_AGENT", "unknown"),
            "started_at": now_ts,
        }
        conn.zadd(active_key, {json.dumps(session_meta): refresh_expiry})

        return {"access": access_token, "refresh": refresh_token}

    @classmethod
    def blacklist_tokens(cls, jtis: list[str], ttl: int = 86400) -> None:
        """
        Atomically invalidates tokens by adding them to the global Redis blacklist.
        """
        for jti in jtis:
            if jti:
                cache.set(f"auth:blacklist:{jti}", "1", timeout=ttl)

    @classmethod
    def logout(cls, user_id: str, access_jti: str, refresh_jti: str) -> None:
        """
        Terminates a specific session immediately by blacklisting both tokens.
        """
        cls.blacklist_tokens([access_jti, refresh_jti])

        active_key = f"auth:active_sessions:{user_id}"
        conn = cache.client.get_client()
        sessions = conn.zrange(active_key, 0, -1)
        for s in sessions:
            meta = json.loads(s.decode())
            if meta["access_jti"] == access_jti:
                conn.zrem(active_key, s)
                break
