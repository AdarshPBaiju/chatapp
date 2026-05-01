import json
import logging
import time
from typing import Any

from django.core.cache import cache

logger = logging.getLogger("core")


class RedisSessionStore:
    REGISTER_SESSION_LUA = """
    local sessions_key = KEYS[1]
    local hash_prefix = KEYS[2]
    local limit = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local session_id = ARGV[3]
    local meta_json = ARGV[4]
    local expiry_ts = tonumber(ARGV[5])
    local ttl = tonumber(ARGV[6])

    redis.call('ZREMRANGEBYSCORE', sessions_key, '-inf', now)
    if limit == 0 or redis.call('ZCARD', sessions_key) < limit then
        redis.call('ZADD', sessions_key, expiry_ts, session_id)

        redis.call('SETEX', hash_prefix .. session_id, ttl, meta_json)
        return 'SUCCESS'
    end
    return redis.call('ZRANGE', sessions_key, 0, -1)
    """

    UPDATE_SESSION_LUA = """
    local sessions_key = KEYS[1]
    local hash_prefix = KEYS[2]
    local now = tonumber(ARGV[1])
    local session_id = ARGV[2]
    local meta_json = ARGV[3]
    local expiry_ts = tonumber(ARGV[4])
    local ttl = tonumber(ARGV[5])

    redis.call('ZREMRANGEBYSCORE', sessions_key, '-inf', now)
    if redis.call('ZSCORE', sessions_key, session_id) then
        redis.call('ZADD', sessions_key, expiry_ts, session_id)
        redis.call('SETEX', hash_prefix .. session_id, ttl, meta_json)
        return 'SUCCESS'
    end
    return 'FAILURE'
    """

    @classmethod
    def register_session(
        cls,
        user_id: str,
        session_id: str,
        session_meta: dict[str, Any],
        refresh_expiry_ts: int,
        device_limit: int,
        now_ts: int,
    ) -> str | list[str]:
        conn = cls._get_connection()
        ttl = max(refresh_expiry_ts - now_ts, 1)
        if not hasattr(conn, "eval"):
            sessions_key = f"auth:user:{user_id}:sessions"
            existing_sessions = conn.get(sessions_key) or []
            active_sessions = [
                item for item in existing_sessions
                if int(item.get("expires_at", 0)) > now_ts
            ]
            if device_limit and len(active_sessions) >= device_limit:
                return [item["session_id"] for item in active_sessions]

            session_record = {
                **session_meta,
                "session_id": session_id,
                "expires_at": refresh_expiry_ts,
            }
            active_sessions.append(session_record)
            conn.set(sessions_key, active_sessions, timeout=ttl)
            conn.set(f"auth:session:{session_id}", session_meta, timeout=ttl)
            return "SUCCESS"

        res = conn.eval(
            cls.REGISTER_SESSION_LUA,
            2,
            f"auth:user:{user_id}:sessions",
            "auth:session:",
            device_limit,
            now_ts,
            session_id,
            json.dumps(session_meta),
            refresh_expiry_ts,
            ttl,
        )
        if isinstance(res, bytes):
            return res.decode()
        if isinstance(res, list):
            return [s.decode() if isinstance(s, bytes) else s for s in res]
        return res

    @classmethod
    def update_session(
        cls,
        user_id: str,
        session_id: str,
        session_meta: dict[str, Any],
        refresh_expiry_ts: int,
        now_ts: int,
    ) -> str:
        conn = cls._get_connection()
        ttl = max(refresh_expiry_ts - now_ts, 1)
        if not hasattr(conn, "eval"):
            sessions_key = f"auth:user:{user_id}:sessions"
            existing_sessions = conn.get(sessions_key) or []
            updated = False
            refreshed_sessions = []
            for item in existing_sessions:
                if int(item.get("expires_at", 0)) <= now_ts:
                    continue
                if item.get("session_id") == session_id:
                    refreshed_sessions.append({
                        **session_meta,
                        "session_id": session_id,
                        "expires_at": refresh_expiry_ts,
                    })
                    updated = True
                else:
                    refreshed_sessions.append(item)

            if updated:
                conn.set(sessions_key, refreshed_sessions, timeout=ttl)
                conn.set(f"auth:session:{session_id}", session_meta, timeout=ttl)
                return "SUCCESS"
            return "FAILURE"

        res = conn.eval(
            cls.UPDATE_SESSION_LUA,
            2,
            f"auth:user:{user_id}:sessions",
            "auth:session:",
            now_ts,
            session_id,
            json.dumps(session_meta),
            refresh_expiry_ts,
            ttl,
        )
        return res.decode() if isinstance(res, bytes) else res

    @classmethod
    def _get_connection(cls):
        from django.core.cache import cache

        try:
            return cache.client.get_client()
        except AttributeError:
            return cache

    @classmethod
    def remove_session(cls, user_id: str, session_id: str) -> None:
        conn = cls._get_connection()
        conn.zrem(f"auth:user:{user_id}:sessions", session_id)
        conn.delete(f"auth:session:{session_id}")

    @classmethod
    def touch_session(cls, session_id: str, now_ts: int) -> None:
        cache.set(f"auth:session:{session_id}:touch", now_ts, timeout=3600)

    @classmethod
    def get_last_active(cls, session_id: str) -> int | None:
        return cache.get(f"auth:session:{session_id}:touch")

    @classmethod
    def sync_active_sessions(cls, user_id: str, sessions: list[dict[str, Any]]) -> None:
        """
        Best-effort cache synchronization for session listings.
        This is intentionally non-authoritative; the database remains the source of truth.
        """
        conn = cls._get_connection()
        sessions_key = f"auth:user:{user_id}:sessions"
        conn.delete(sessions_key)
        now_ts = int(time.time())
        for session in sessions:
            expires_at = int(session.get("expires_at", now_ts + 3600))
            ttl = max(expires_at - now_ts, 1)
            session_id = session["session_id"]
            conn.zadd(sessions_key, {session_id: expires_at})
            conn.setex(f"auth:session:{session_id}", ttl, json.dumps(session))


class TokenBlacklistService:
    @staticmethod
    def blacklist_tokens(jtis: list[str]) -> None:
        from authentication.identity.infrastructure.models import TokenBlacklist
        from django.utils import timezone

        # Blacklist in Django DB for persistence
        for jti in jtis:
            if jti:
                TokenBlacklist.objects.get_or_create(
                    jti=jti,
                    defaults={
                        "expires_at": timezone.now() + timezone.timedelta(days=7)
                    },
                )

        # Also blacklist in Redis for fast lookup
        for jti in jtis:
            if jti:
                cache.set(f"blacklist:{jti}", "1", timeout=86400)

    @staticmethod
    def is_blacklisted(jti: str) -> bool:
        return bool(cache.get(f"blacklist:{jti}"))


class GraceJTIService:
    """
    Manages a 60-second grace window for recently rotated access tokens.
    This prevents race conditions during page refreshes and background rotations
    without compromising the absolute security of JTI matching.
    """

    @staticmethod
    def register_grace_jti(session_id: str, jti: str) -> None:
        if jti:
            cache.set(f"grace_jti:{session_id}:{jti}", "1", timeout=60)

    @staticmethod
    def is_in_grace(session_id: str, jti: str) -> bool:
        if not jti:
            return False
        return bool(cache.get(f"grace_jti:{session_id}:{jti}"))


class RefreshGraceService:
    """
    Handles 'Inherited Tokens' during rotation.
    Caches the results of a successful refresh call for 60 seconds,
    keyed by the OLD refresh JTI. This allows parallel requests (e.g. from multiple tabs)
    to adopt the latest tokens instead of failing due to a JTI mismatch.
    """

    @staticmethod
    def register_rotated_result(old_refresh_jti: str, tokens: dict[str, Any]) -> None:
        if old_refresh_jti:
            cache.set(f"rotated_tokens:{old_refresh_jti}", tokens, timeout=60)

    @staticmethod
    def get_rotated_result(old_refresh_jti: str) -> dict[str, Any] | None:
        if not old_refresh_jti:
            return None
        return cache.get(f"rotated_tokens:{old_refresh_jti}")
