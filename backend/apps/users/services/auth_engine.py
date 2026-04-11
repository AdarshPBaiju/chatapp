from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone as dj_timezone

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import build_auth_request_context
from users.models import AuthSession, ClientDevice, TokenBlacklist

if TYPE_CHECKING:
    from users.models import CustomUser

logger = logging.getLogger("core")


class AuthEngine:
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
    if redis.call('ZCARD', sessions_key) < limit then
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
    def issue_tokens(cls, user: CustomUser, request: Any) -> dict[str, Any]:
        user_id = str(user.id)
        now_ts = cls._now_ts()
        refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        refresh_expiry_ts = now_ts + refresh_ttl
        refresh_expiry_dt = datetime.fromtimestamp(refresh_expiry_ts, tz=timezone.utc)

        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())
        session_id = str(uuid.uuid4())
        context = build_auth_request_context(request)
        session_meta = cls._session_meta(
            session_id=session_id,
            access_jti=access_jti,
            refresh_jti=refresh_jti,
            context=context,
            started_at=now_ts,
        )

        register_res = cls._register_session_in_redis(
            user_id=user_id,
            session_id=session_id,
            session_meta=session_meta,
            refresh_expiry_ts=refresh_expiry_ts,
        )

        if register_res == "SUCCESS":
            cls._persist_session(
                user=user,
                session_id=session_id,
                access_jti=access_jti,
                refresh_jti=refresh_jti,
                fingerprint=context.fingerprint,
                device_label=context.device_label,
                device_entropy=context.device_entropy,
                ip_address=context.ip_address,
                expires_at=refresh_expiry_dt,
            )
            cls._sync_device_registry(user, context)
            return {
                "status": "full",
                "access": cls._create_token(
                    user_id=user_id,
                    jti=access_jti,
                    p_jti=refresh_jti,
                    sid=session_id,
                    fpt=context.fingerprint,
                    t_type="access",
                ),
                "refresh": cls._create_token(
                    user_id=user_id,
                    jti=refresh_jti,
                    p_jti=access_jti,
                    sid=session_id,
                    fpt=context.fingerprint,
                    t_type="refresh",
                ),
                "session_id": session_id,
            }

        logger.info("session_limit_reached", extra={"user_id": user_id})
        revoke_token = cls._create_token(
            user_id=user_id,
            jti=access_jti,
            p_jti=refresh_jti,
            sid=session_id,
            fpt=context.fingerprint,
            t_type="access",
            scope="revoke_only",
        )
        return {
            "status": "restricted",
            "access": revoke_token,
            "active_sessions": cls.list_active_sessions(user_id=user_id),
            "message": "Maximum device limit reached. Please revoke an existing session to continue.",
        }

    @classmethod
    def refresh_tokens(
        cls, user: CustomUser, old_payload: dict[str, Any], request: Any
    ) -> dict[str, str]:
        user_id = str(user.id)
        old_refresh_jti = old_payload["jti"]
        session_id = str(old_payload.get("sid", ""))
        context = build_auth_request_context(request)
        now_ts = cls._now_ts()
        refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        refresh_expiry_ts = now_ts + refresh_ttl
        refresh_expiry_dt = datetime.fromtimestamp(refresh_expiry_ts, tz=timezone.utc)

        cls.blacklist_tokens([old_refresh_jti], exp_timestamp=old_payload.get("exp"))
        session = cls._get_active_session(
            user_id=user_id,
            session_id=session_id,
            refresh_jti=old_refresh_jti,
        )
        if not session:
            raise ValueError("Session context not found or already revoked.")

        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())
        session_meta = cls._session_meta(
            session_id=str(session.session_id),
            access_jti=access_jti,
            refresh_jti=refresh_jti,
            context=context,
            started_at=int(session.started_at.timestamp()),
        )

        update_res = cls._update_session_in_redis(
            user_id=user_id,
            session_id=str(session.session_id),
            session_meta=session_meta,
            refresh_expiry_ts=refresh_expiry_ts,
        )
        if update_res != "SUCCESS":
            cls._hydrate_session_to_redis(session)
            retry_res = cls._update_session_in_redis(
                user_id=user_id,
                session_id=str(session.session_id),
                session_meta=session_meta,
                refresh_expiry_ts=refresh_expiry_ts,
            )
            if retry_res != "SUCCESS":
                raise ValueError("Session state changed. Please authenticate again.")

        session.access_jti = access_jti
        session.refresh_jti = refresh_jti
        session.fingerprint = context.fingerprint
        session.device_label = context.device_label
        session.device_entropy = context.device_entropy
        session.ip_address = context.ip_address
        session.last_seen_at = dj_timezone.now()
        session.expires_at = refresh_expiry_dt
        session.save(
            update_fields=[
                "access_jti",
                "refresh_jti",
                "fingerprint",
                "device_label",
                "device_entropy",
                "ip_address",
                "last_seen_at",
                "expires_at",
                "updated_at",
            ]
        )
        cls._sync_device_registry(user, context)

        return {
            "access": cls._create_token(
                user_id=user_id,
                jti=access_jti,
                p_jti=refresh_jti,
                sid=str(session.session_id),
                fpt=context.fingerprint,
                t_type="access",
            ),
            "refresh": cls._create_token(
                user_id=user_id,
                jti=refresh_jti,
                p_jti=access_jti,
                sid=str(session.session_id),
                fpt=context.fingerprint,
                t_type="refresh",
            ),
        }

    @classmethod
    def promote_restricted_session(
        cls,
        user_id: str,
        access_jti: str,
        refresh_jti: str,
        request: Any,
        session_id: str | None = None,
    ) -> dict[str, str]:
        context = build_auth_request_context(request)
        now_ts = cls._now_ts()
        refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        refresh_expiry_ts = now_ts + refresh_ttl
        refresh_expiry_dt = datetime.fromtimestamp(refresh_expiry_ts, tz=timezone.utc)
        selected_session_id = session_id or str(uuid.uuid4())

        session_meta = cls._session_meta(
            session_id=selected_session_id,
            access_jti=access_jti,
            refresh_jti=refresh_jti,
            context=context,
            started_at=now_ts,
        )
        register_res = cls._register_session_in_redis(
            user_id=user_id,
            session_id=selected_session_id,
            session_meta=session_meta,
            refresh_expiry_ts=refresh_expiry_ts,
        )
        if register_res != "SUCCESS":
            logger.info(
                "restricted_promotion_blocked",
                extra={"user_id": user_id, "session_id": selected_session_id},
            )
            raise ValueError("Device limit still reached after revocation.")

        from users.models import CustomUser

        user = CustomUser.objects.get(id=user_id, is_active=True)
        cls._persist_session(
            user=user,
            session_id=selected_session_id,
            access_jti=access_jti,
            refresh_jti=refresh_jti,
            fingerprint=context.fingerprint,
            device_label=context.device_label,
            device_entropy=context.device_entropy,
            ip_address=context.ip_address,
            expires_at=refresh_expiry_dt,
        )
        cls._sync_device_registry(user, context)

        return {
            "access": cls._create_token(
                user_id=user_id,
                jti=access_jti,
                p_jti=refresh_jti,
                sid=selected_session_id,
                fpt=context.fingerprint,
                t_type="access",
            ),
            "refresh": cls._create_token(
                user_id=user_id,
                jti=refresh_jti,
                p_jti=access_jti,
                sid=selected_session_id,
                fpt=context.fingerprint,
                t_type="refresh",
            ),
        }

    @staticmethod
    def _create_token(
        user_id: str,
        jti: str,
        p_jti: str,
        sid: str,
        fpt: str,
        t_type: str,
        **kwargs: Any,
    ) -> str:
        scope = kwargs.get("scope", "full")
        ttl = (
            settings.AUTH_ENGINE_SETTINGS["ACCESS_TOKEN_LIFETIME"]
            if t_type == "access"
            else settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )
        if scope == "revoke_only":
            ttl = 900

        payload = {
            "user_id": user_id,
            "jti": jti,
            "partner_jti": p_jti,
            "sid": sid,
            "fpt": fpt,
            "type": t_type,
            "scope": scope,
        }
        return AuthCryptoEngine.encrypt_and_sign(payload, ttl)

    @classmethod
    def blacklist_tokens(
        cls,
        jtis: list[str],
        *,
        exp_timestamp: int | None = None,
        ttl: int | None = None,
    ) -> None:
        now = dj_timezone.now()
        for jti in jtis:
            if not jti:
                continue
            expires_at = (
                datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                if exp_timestamp
                else now
                + timedelta(
                    seconds=ttl
                    or settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
                )
            )
            timeout = max(int((expires_at - now).total_seconds()), 1)
            cache.set(f"auth:blacklist:{jti}", "1", timeout=timeout)
            TokenBlacklist.objects.update_or_create(
                jti=jti,
                defaults={"expires_at": expires_at},
            )

    @classmethod
    def is_blacklisted(cls, jti: str) -> bool:
        if not jti:
            return True
        if cache.get(f"auth:blacklist:{jti}"):
            return True
        now = dj_timezone.now()
        record = TokenBlacklist.objects.filter(jti=jti, expires_at__gt=now).first()
        if record:
            timeout = max(int((record.expires_at - now).total_seconds()), 1)
            cache.set(f"auth:blacklist:{jti}", "1", timeout=timeout)
            return True
        return False

    @classmethod
    def is_session_active(
        cls,
        user_id: str,
        session_id: str,
        jti: str,
        partner_jti: str | None = None,
    ) -> bool:
        if not session_id:
            return False
        query = AuthSession.objects.filter(
            user_id=user_id,
            session_id=session_id,
            is_active=True,
            expires_at__gt=dj_timezone.now(),
        )
        if query.filter(access_jti=jti).exists() or query.filter(refresh_jti=jti).exists():
            return True
        if partner_jti and (
            query.filter(access_jti=partner_jti).exists()
            or query.filter(refresh_jti=partner_jti).exists()
        ):
            return True
        return False

    @classmethod
    def touch_session(cls, user_id: str, session_id: str) -> None:
        AuthSession.objects.filter(
            user_id=user_id,
            session_id=session_id,
            is_active=True,
        ).update(last_seen_at=dj_timezone.now())

    @classmethod
    @transaction.atomic
    def logout(
        cls,
        user_id: str,
        access_jti: str,
        refresh_jti: str,
        session_id: str | None = None,
    ) -> None:
        cls.blacklist_tokens([access_jti, refresh_jti])

        session = cls._get_active_session(
            user_id=user_id,
            session_id=session_id,
            refresh_jti=refresh_jti,
            access_jti=access_jti,
        )
        if session:
            session.is_active = False
            session.last_seen_at = dj_timezone.now()
            session.save(update_fields=["is_active", "last_seen_at", "updated_at"])
            cls._remove_session_from_redis(user_id=user_id, session_id=str(session.session_id))
            logger.info(
                "session_revoked",
                extra={"user_id": user_id, "session_id": str(session.session_id)},
            )

    @classmethod
    def revoke_session(
        cls,
        *,
        user_id: str,
        session_id: str | None = None,
        access_jti: str | None = None,
    ) -> bool:
        query = AuthSession.objects.filter(
            user_id=user_id, is_active=True, expires_at__gt=dj_timezone.now()
        )
        if session_id:
            query = query.filter(session_id=session_id)
        elif access_jti:
            query = query.filter(access_jti=access_jti)
        else:
            return False

        session = query.first()
        if not session:
            return False

        cls.logout(
            user_id=user_id,
            access_jti=session.access_jti,
            refresh_jti=session.refresh_jti,
            session_id=str(session.session_id),
        )
        return True

    @classmethod
    def list_active_sessions(cls, user_id: str, current_sid: str | None = None) -> list[dict[str, Any]]:
        sessions = (
            AuthSession.objects.filter(
                user_id=user_id,
                is_active=True,
                expires_at__gt=dj_timezone.now(),
            )
            .order_by("-last_seen_at")
            .all()
        )
        result = []
        for session in sessions:
            result.append(
                {
                    "session_id": str(session.session_id),
                    "access_jti": session.access_jti,
                    "refresh_jti": session.refresh_jti,
                    "device": session.device_label,
                    "started_at": int(session.started_at.timestamp()),
                    "last_seen_at": int(session.last_seen_at.timestamp()),
                    "is_current": str(session.session_id) == str(current_sid or ""),
                }
            )
            cls._hydrate_session_to_redis(session)
        return result

    @classmethod
    def _register_session_in_redis(
        cls,
        *,
        user_id: str,
        session_id: str,
        session_meta: dict[str, Any],
        refresh_expiry_ts: int,
    ) -> str | list[str]:
        conn = cache.client.get_client()
        now_ts = cls._now_ts()
        ttl = max(refresh_expiry_ts - now_ts, 1)
        res = conn.eval(
            cls.REGISTER_SESSION_LUA,
            2,
            cls._active_key(user_id),
            cls._session_prefix(),
            settings.AUTH_ENGINE_SETTINGS["MAX_DEVICES_PER_USER"],
            now_ts,
            session_id,
            json.dumps(session_meta),
            refresh_expiry_ts,
            ttl,
        )
        if res == b"SUCCESS":
            return "SUCCESS"
        if isinstance(res, list):
            return [m.decode() if isinstance(m, bytes) else str(m) for m in res]
        return "FAILURE"

    @classmethod
    def _update_session_in_redis(
        cls,
        *,
        user_id: str,
        session_id: str,
        session_meta: dict[str, Any],
        refresh_expiry_ts: int,
    ) -> str:
        conn = cache.client.get_client()
        now_ts = cls._now_ts()
        ttl = max(refresh_expiry_ts - now_ts, 1)
        res = conn.eval(
            cls.UPDATE_SESSION_LUA,
            2,
            cls._active_key(user_id),
            cls._session_prefix(),
            now_ts,
            session_id,
            json.dumps(session_meta),
            refresh_expiry_ts,
            ttl,
        )
        return res.decode() if isinstance(res, bytes) else str(res)

    @classmethod
    def _hydrate_session_to_redis(cls, session: AuthSession) -> None:
        if session.is_expired or not session.is_active:
            return
        expiry_ts = int(session.expires_at.timestamp())
        now_ts = cls._now_ts()
        ttl = max(expiry_ts - now_ts, 1)
        meta = {
            "session_id": str(session.session_id),
            "access_jti": session.access_jti,
            "refresh_jti": session.refresh_jti,
            "device": session.device_label,
            "ip": session.ip_address,
            "started_at": int(session.started_at.timestamp()),
            "last_seen_at": int(session.last_seen_at.timestamp()),
        }
        conn = cache.client.get_client()
        conn.zadd(cls._active_key(str(session.user_id)), {str(session.session_id): expiry_ts})
        conn.setex(cls._session_key(str(session.session_id)), ttl, json.dumps(meta))

    @classmethod
    def _remove_session_from_redis(cls, *, user_id: str, session_id: str) -> None:
        conn = cache.client.get_client()
        conn.zrem(cls._active_key(user_id), session_id)
        conn.delete(cls._session_key(session_id))

    @classmethod
    def _persist_session(
        cls,
        *,
        user: CustomUser,
        session_id: str,
        access_jti: str,
        refresh_jti: str,
        fingerprint: str,
        device_label: str,
        device_entropy: str,
        ip_address: str,
        expires_at: datetime,
    ) -> None:
        now = dj_timezone.now()
        AuthSession.objects.update_or_create(
            user=user,
            session_id=session_id,
            defaults={
                "access_jti": access_jti,
                "refresh_jti": refresh_jti,
                "fingerprint": fingerprint,
                "device_label": device_label,
                "device_entropy": device_entropy,
                "ip_address": ip_address,
                "is_active": True,
                "started_at": now,
                "last_seen_at": now,
                "expires_at": expires_at,
            },
        )

    @classmethod
    def _sync_device_registry(cls, user: CustomUser, context: Any) -> None:
        if not context.device_entropy:
            return
        client = getattr(user, "client", None)
        if not client:
            return
        ClientDevice.objects.update_or_create(
            client=client,
            entropy_id=context.device_entropy,
            defaults={
                "device_id": context.device_entropy[:64],
                "device_type": context.device_label[:50],
                "device_name": context.device_label[:255],
                "last_seen_ip": context.ip_address,
                "is_active": True,
            },
        )

    @classmethod
    def _get_active_session(
        cls,
        *,
        user_id: str,
        session_id: str | None = None,
        refresh_jti: str | None = None,
        access_jti: str | None = None,
    ) -> AuthSession | None:
        query = AuthSession.objects.filter(
            user_id=user_id,
            is_active=True,
            expires_at__gt=dj_timezone.now(),
        )
        if session_id:
            query = query.filter(session_id=session_id)
        if refresh_jti:
            query = query.filter(refresh_jti=refresh_jti)
        if access_jti:
            query = query.filter(access_jti=access_jti)
        return query.first()

    @staticmethod
    def _session_meta(
        *,
        session_id: str,
        access_jti: str,
        refresh_jti: str,
        context: Any,
        started_at: int,
    ) -> dict[str, Any]:
        return {
            "session_id": session_id,
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "device": context.device_label,
            "ip": context.ip_address,
            "started_at": started_at,
            "last_seen_at": AuthEngine._now_ts(),
        }

    @staticmethod
    def _active_key(user_id: str) -> str:
        return f"auth:active_sessions:{user_id}"

    @staticmethod
    def _session_prefix() -> str:
        return "auth:session:"

    @classmethod
    def _session_key(cls, session_id: str) -> str:
        return f"{cls._session_prefix()}{session_id}"

    @staticmethod
    def _now_ts() -> int:
        return int(datetime.now(timezone.utc).timestamp())
