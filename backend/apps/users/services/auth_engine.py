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
    Utilizes atomic Lua scripts for sub-millisecond session management and
    enforces JioHotstar-style device limits.
    """

    # Atomic Lua script to check limits and register session
    REGISTER_SESSION_LUA = """
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local meta = ARGV[3]
    local expiry = tonumber(ARGV[4])

    -- 1. Prune expired sessions
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now)

    -- 2. Check if under limit
    local current_count = redis.call('ZCARD', key)
    if current_count < limit then
        redis.call('ZADD', key, expiry, meta)
        return 'SUCCESS'
    else
        -- Return all active sessions for the 'Revoke' screen
        return redis.call('ZRANGE', key, 0, -1)
    end
    """

    @classmethod
    def issue_tokens(cls, user: CustomUser, request: Any) -> dict[str, Any]:
        """
        Issues tokens with atomic limit enforcement.
        Returns either full tokens or a 'revoke_only' token with the active session list.
        """
        user_id = str(user.id)
        active_key = f"auth:active_sessions:{user_id}"
        now_ts = int(datetime.now(UTC).timestamp())
        max_devices = settings.AUTH_ENGINE_SETTINGS["MAX_DEVICES_PER_USER"]
        refresh_expiry = (
            now_ts + settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )

        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())
        device_label = AuthCryptoEngine.parse_device_info(request)
        fingerprint = AuthCryptoEngine.generate_fingerprint(request)

        session_meta = {
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "device": device_label,
            "ip": request.META.get("REMOTE_ADDR"),
            "started_at": now_ts,
        }

        conn = cache.client.get_client()
        result = conn.eval(
            cls.REGISTER_SESSION_LUA,
            1,
            active_key,
            max_devices,
            now_ts,
            json.dumps(session_meta),
            refresh_expiry,
        )

        if result == b"SUCCESS":
            return {
                "status": "full",
                "access": cls._create_token(
                    user_id, access_jti, refresh_jti, fingerprint, "access"
                ),
                "refresh": cls._create_token(
                    user_id, refresh_jti, access_jti, fingerprint, "refresh"
                ),
            }

        # Handle Limit Reached: Issue Temporary Revoke Token
        active_sessions = [json.loads(s.decode()) for s in result]
        revoke_token = cls._create_token(
            user_id, access_jti, refresh_jti, fingerprint, "access", scope="revoke_only"
        )

        return {
            "status": "restricted",
            "access": revoke_token,
            "active_sessions": active_sessions,
            "message": "Maximum device limit reached. Please revoke an existing session to continue.",
        }

    @classmethod
    def promote_restricted_session(
        cls, user_id: str, access_jti: str, refresh_jti: str, request: Any
    ) -> dict[str, str]:
        """
        Atomically upgrades a restricted session to full access.
        """
        active_key = f"auth:active_sessions:{user_id}"
        now_ts = int(datetime.now(UTC).timestamp())
        refresh_expiry = (
            now_ts + settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )

        device_label = AuthCryptoEngine.parse_device_info(request)
        fingerprint = AuthCryptoEngine.generate_fingerprint(request)

        session_meta = {
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "device": device_label,
            "ip": request.META.get("REMOTE_ADDR"),
            "started_at": now_ts,
        }

        conn = cache.client.get_client()
        conn.zadd(active_key, {json.dumps(session_meta): refresh_expiry})

        return {
            "access": cls._create_token(
                user_id, access_jti, refresh_jti, fingerprint, "access"
            ),
            "refresh": cls._create_token(
                user_id, refresh_jti, access_jti, fingerprint, "refresh"
            ),
        }

    @staticmethod
    def _create_token(
        uid: str, jti: str, p_jti: str, fpt: str, t_type: str, **kwargs: Any
    ) -> str:
        """
        Generates a signed and encrypted JWT with specific scope and fingerprint binding.
        """
        scope = kwargs.get("scope", "full")
        ttl = (
            settings.AUTH_ENGINE_SETTINGS["ACCESS_TOKEN_LIFETIME"]
            if t_type == "access"
            else settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )

        if scope == "revoke_only":
            ttl = 900  # 15 mins

        payload = {
            "user_id": uid,
            "jti": jti,
            "partner_jti": p_jti,
            "fpt": fpt,
            "type": t_type,
            "scope": scope,
        }
        return AuthCryptoEngine.encrypt_and_sign(payload, ttl)

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
