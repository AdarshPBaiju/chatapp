from __future__ import annotations

import json
import logging
import requests
import uuid
from math import atan2, cos, radians, sin, sqrt
from datetime import datetime, timedelta, UTC
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone as dj_timezone

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import build_auth_request_context
from core.models import GlobalConfiguration
from users.models import AuthSession, ClientDevice, TokenBlacklist, CustomUser


logger = logging.getLogger("core")


class AuthEngine:
    ACTIVITY_GRACE_PERIOD = timedelta(minutes=10)

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
        with transaction.atomic():
            user_id = str(user.id)
            context = build_auth_request_context(request)
            location = cls._normalize_location(
                cls._get_location_from_ip(context.ip_address)
            )

            now_ts = cls._now_ts()
            refresh_expiry_ts = (
                now_ts + settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
            )

            current_session = cls.resolve_current_session(
                user_id=user_id,
                session_id=None,
                access_jti=None,
                fingerprint=context.fingerprint,
                device_entropy=context.device_entropy,
                for_update=True,
            )

            if current_session:
                is_anomaly = cls._check_impossible_travel(user_id, context, location)

                if (
                    is_anomaly
                    or cls._count_active_sessions(user_id) > cls._device_limit()
                ):
                    return cls._build_restricted_response(
                        user_id=user_id,
                        context=context,
                        access_jti=str(uuid.uuid4()),
                        refresh_jti=str(uuid.uuid4()),
                        session_id=str(current_session.session_id),
                        location=location,
                    )

                rotated = cls._rotate_session_tokens(
                    user=user,
                    session=current_session,
                    context=context,
                    location=location,
                    blacklist_previous=True,
                )
                return {"status": "full", **rotated}

            session_id = str(uuid.uuid4())
            access_jti = str(uuid.uuid4())
            refresh_jti = str(uuid.uuid4())

            session_meta = cls._session_meta(
                session_id=session_id,
                access_jti=access_jti,
                refresh_jti=refresh_jti,
                context=context,
                started_at=now_ts,
                location=location,
            )

            register_res = cls._register_session_in_redis(
                user_id=user_id,
                session_id=session_id,
                session_meta=session_meta,
                refresh_expiry_ts=refresh_expiry_ts,
            )

            if register_res != "SUCCESS":
                active_db_count = AuthSession.objects.filter(
                    user_id=user_id,
                    is_active=True,
                    expires_at__gt=dj_timezone.now(),
                ).count()
                if active_db_count == 0:
                    cls._prune_stale_redis_sessions(
                        user_id=user_id,
                        session_ids=register_res
                        if isinstance(register_res, list)
                        else None,
                    )
                    register_res = cls._register_session_in_redis(
                        user_id=user_id,
                        session_id=session_id,
                        session_meta=session_meta,
                        refresh_expiry_ts=refresh_expiry_ts,
                    )
                if register_res != "SUCCESS":
                    return cls._build_restricted_response(
                        user_id=user_id,
                        context=context,
                        access_jti=access_jti,
                        refresh_jti=refresh_jti,
                        session_id=session_id,
                        location=location,
                    )

            cls._persist_session(
                user=user,
                session_id=session_id,
                access_jti=access_jti,
                refresh_jti=refresh_jti,
                fingerprint=context.fingerprint,
                device_label=context.device_label,
                device_entropy=context.device_entropy,
                ip_address=context.ip_address,
                expires_at=datetime.fromtimestamp(refresh_expiry_ts, tz=UTC),
                city=location.get("city") or "",
                country_code=location.get("country_code") or "",
                latitude=location.get("lat"),
                longitude=location.get("lon"),
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

    @classmethod
    def refresh_tokens(
        cls, user: CustomUser, old_payload: dict[str, Any], request: Any
    ) -> dict[str, Any]:
        with transaction.atomic():
            user_id = str(user.id)
            old_refresh_jti = old_payload["jti"]
            old_access_jti = old_payload.get("partner_jti", "")
            session_id = str(old_payload.get("sid", ""))
            context = build_auth_request_context(request)
            session = cls._get_active_session(
                user_id=user_id,
                session_id=session_id,
                refresh_jti=old_refresh_jti,
                for_update=True,
            )
            if not session:
                raise ValueError("Session context not found or already revoked.")

            location = cls._normalize_location(
                cls._get_location_from_ip(context.ip_address)
            )
            is_anomaly = cls._check_impossible_travel(user_id, context, location)

            if is_anomaly or cls._count_active_sessions(user_id) > cls._device_limit():
                cls.blacklist_tokens(
                    [old_access_jti, old_refresh_jti],
                    exp_timestamp=old_payload.get("exp"),
                )
                session.fingerprint = context.fingerprint
                session.device_label = context.device_label
                session.device_entropy = context.device_entropy
                session.ip_address = context.ip_address
                session.last_seen_at = dj_timezone.now()

                # Update location fields in DB
                session.city = location.get("city") or ""
                session.country_code = location.get("country_code") or ""
                session.latitude = location.get("lat")
                session.longitude = location.get("lon")

                session.save(
                    update_fields=[
                        "fingerprint",
                        "device_label",
                        "device_entropy",
                        "ip_address",
                        "last_seen_at",
                        "updated_at",
                        "city",
                        "country_code",
                        "latitude",
                        "longitude",
                    ]
                )
                return cls._build_restricted_response(
                    user_id=user_id,
                    context=context,
                    access_jti=str(uuid.uuid4()),
                    refresh_jti=str(uuid.uuid4()),
                    session_id=str(session.session_id),
                    location=location,
                )

            cls.blacklist_tokens(
                [old_refresh_jti], exp_timestamp=old_payload.get("exp")
            )
            rotated = cls._rotate_session_tokens(
                user=user,
                session=session,
                context=context,
                location=location,
            )
            return {"status": "full", **rotated}

    @classmethod
    def promote_restricted_session(
        cls,
        user_id: str,
        access_jti: str,
        refresh_jti: str,
        request: Any,
        session_id: str | None = None,
    ) -> dict[str, str]:
        with transaction.atomic():
            context = build_auth_request_context(request)
            location = cls._get_location_from_ip(context.ip_address)

            user = CustomUser.objects.get(id=user_id, is_active=True)
            current_session = cls.resolve_current_session(
                user_id=user_id,
                session_id=session_id,
                access_jti=None,
                fingerprint=context.fingerprint,
                device_entropy=context.device_entropy,
                for_update=True,
            )
            if current_session:
                if cls._count_active_sessions(user_id) > cls._device_limit():
                    logger.info(
                        "restricted_promotion_blocked",
                        extra={
                            "user_id": user_id,
                            "session_id": str(current_session.session_id),
                        },
                    )
                    raise ValueError("Device limit still reached after revocation.")

                return cls._rotate_session_tokens(
                    user=user,
                    session=current_session,
                    context=context,
                    location=location,
                    access_jti=access_jti,
                    refresh_jti=refresh_jti,
                    blacklist_previous=True,
                )

            now_ts = cls._now_ts()
            refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
            refresh_expiry_ts = now_ts + refresh_ttl
            refresh_expiry_dt = datetime.fromtimestamp(refresh_expiry_ts, tz=UTC)
            selected_session_id = session_id or str(uuid.uuid4())

            session_meta = cls._session_meta(
                session_id=selected_session_id,
                access_jti=access_jti,
                refresh_jti=refresh_jti,
                context=context,
                started_at=now_ts,
                location=location,
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
                city=location.get("city") or "",
                country_code=location.get("country_code") or "",
                latitude=location.get("lat"),
                longitude=location.get("lon"),
            )
            return {
                "status": "full",
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

    @classmethod
    def _rotate_session_tokens(
        cls,
        *,
        user: CustomUser,
        session: AuthSession,
        context: Any,
        location: dict[str, Any] | None = None,
        access_jti: str | None = None,
        refresh_jti: str | None = None,
        blacklist_previous: bool = False,
    ) -> dict[str, str]:
        user_id = str(user.id)
        now_ts = cls._now_ts()
        refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        refresh_expiry_ts = now_ts + refresh_ttl
        refresh_expiry_dt = datetime.fromtimestamp(refresh_expiry_ts, tz=UTC)
        next_access_jti = access_jti or str(uuid.uuid4())
        next_refresh_jti = refresh_jti or str(uuid.uuid4())
        previous_access_jti = session.access_jti
        previous_refresh_jti = session.refresh_jti

        session_meta = cls._session_meta(
            session_id=str(session.session_id),
            access_jti=next_access_jti,
            refresh_jti=next_refresh_jti,
            context=context,
            started_at=int(session.started_at.timestamp()),
            location=location,
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

        normalized_location = cls._normalize_location(location)
        session.access_jti = next_access_jti
        session.refresh_jti = next_refresh_jti
        session.fingerprint = context.fingerprint
        session.device_label = context.device_label
        session.device_entropy = context.device_entropy
        session.ip_address = context.ip_address
        session.last_seen_at = dj_timezone.now()
        session.expires_at = refresh_expiry_dt
        session.city = normalized_location["city"]
        session.country_code = normalized_location["country_code"]
        session.latitude = normalized_location["lat"]
        session.longitude = normalized_location["lon"]
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
                "city",
                "country_code",
                "latitude",
                "longitude",
                "updated_at",
            ]
        )
        if blacklist_previous and previous_access_jti and previous_refresh_jti:
            cls.blacklist_tokens([previous_access_jti, previous_refresh_jti])
        cls._sync_device_registry(user, context)

        return {
            "access": cls._create_token(
                user_id=user_id,
                jti=next_access_jti,
                p_jti=next_refresh_jti,
                sid=str(session.session_id),
                fpt=context.fingerprint,
                t_type="access",
            ),
            "refresh": cls._create_token(
                user_id=user_id,
                jti=next_refresh_jti,
                p_jti=next_access_jti,
                sid=str(session.session_id),
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
            ttl = 120

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
                datetime.fromtimestamp(exp_timestamp, tz=UTC)
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
            logger.error("is_session_active failed: session_id is empty")
            return False

        now = dj_timezone.now()
        query = AuthSession.objects.filter(
            user_id=user_id,
            session_id=session_id,
        )

        if not query.exists():
            logger.error(
                f"is_session_active failed: session {session_id} not found for user {user_id}"
            )
            return False

        session = query.first()
        if not session.is_active:
            logger.error(
                f"is_session_active failed: session {session_id} is_active=False"
            )
            return False

        if session.expires_at <= now - cls.ACTIVITY_GRACE_PERIOD:
            logger.error(
                f"is_session_active failed: session {session_id} expired. exp={session.expires_at}, now={now}"
            )
            return False

        has_main_token = jti in {session.access_jti, session.refresh_jti}
        if has_main_token:
            return True

        if partner_jti and partner_jti in {session.access_jti, session.refresh_jti}:
            return True

        logger.error(
            f"is_session_active failed: tokens mismatch. session_access={session.access_jti}, session_refresh={session.refresh_jti}, check_jti={jti}, check_partner={partner_jti}"
        )
        return False

    @classmethod
    def touch_session(cls, _user_id: str, session_id: str) -> None:
        """
        Updates the session's last activity time in Redis for high-performance tracking.
        """
        cache_key = f"auth:session:{session_id}:touch"
        cache.set(cache_key, int(dj_timezone.now().timestamp()), timeout=3600)

    @classmethod
    def _get_last_active(cls, session_id: str, db_time: datetime) -> int:
        """
        Returns the most recent activity timestamp from Redis or DB.
        """
        cache_key = f"auth:session:{session_id}:touch"
        redis_time = cache.get(cache_key)
        if redis_time:
            return int(redis_time)
        return int(db_time.timestamp())

    @classmethod
    def revoke_all_sessions(
        cls, user_id: str, exclude_session_id: str | None = None
    ) -> int:
        with transaction.atomic():
            """
            Revokes all active sessions for a user, optionally excluding one session.
            Useful for password resets.
            """
            query = AuthSession.objects.filter(user_id=user_id, is_active=True)
            if exclude_session_id:
                query = query.exclude(session_id=exclude_session_id)

            sessions_to_revoke = query.all()
            count = sessions_to_revoke.count()

            for session in sessions_to_revoke:
                cls.logout(
                    user_id=user_id,
                    access_jti=session.access_jti,
                    refresh_jti=session.refresh_jti,
                    session_id=str(session.session_id),
                )
            return count

    @classmethod
    def revoke_others(cls, user_id: str, current_sid: str) -> int:
        """
        Revokes all sessions for a user except the specified one.
        """
        return cls.revoke_all_sessions(user_id, exclude_session_id=current_sid)

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
            cls._remove_session_from_redis(
                user_id=user_id, session_id=str(session.session_id)
            )
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
    def list_active_sessions(
        cls,
        user_id: str,
        current_sid: str | None = None,
        current_access_jti: str | None = None,
        current_fingerprint: str | None = None,
        current_device_entropy: str | None = None,
    ) -> list[dict[str, Any]]:
        sessions = (
            AuthSession.objects.filter(
                user_id=user_id,
                is_active=True,
                expires_at__gt=dj_timezone.now() - cls.ACTIVITY_GRACE_PERIOD,
            )
            .order_by("-last_seen_at")
            .all()
        )
        result = []
        current_sid_str = str(current_sid or "")
        current_jti_str = str(current_access_jti or "")
        current_fingerprint_str = str(current_fingerprint or "")
        current_device_entropy_str = str(current_device_entropy or "")
        for session in sessions:
            # Check for current session match via multiple high-integrity signals
            is_current = any([
                current_sid_str and str(session.session_id) == current_sid_str,
                current_jti_str and session.access_jti == current_jti_str,
                current_device_entropy_str
                and session.device_entropy == current_device_entropy_str,
                current_fingerprint_str
                and session.fingerprint == current_fingerprint_str,
            ])

            last_active = cls._get_last_active(
                str(session.session_id), session.last_seen_at
            )

            result.append({
                "session_id": str(session.session_id),
                "access_jti": session.access_jti,
                "refresh_jti": session.refresh_jti,
                "device": session.device_label,
                "started_at": int(session.started_at.timestamp()),
                "last_seen_at": last_active,
                "is_current": is_current,
                "city": session.city or "",
                "country_code": session.country_code or "",
            })
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
            cls._device_limit(),
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
        conn.zadd(
            cls._active_key(str(session.user_id)), {str(session.session_id): expiry_ts}
        )
        conn.setex(cls._session_key(str(session.session_id)), ttl, json.dumps(meta))

    @classmethod
    def _remove_session_from_redis(cls, *, user_id: str, session_id: str) -> None:
        conn = cache.client.get_client()
        conn.zrem(cls._active_key(user_id), session_id)
        conn.delete(cls._session_key(session_id))

    @classmethod
    def _prune_stale_redis_sessions(
        cls, *, user_id: str, session_ids: list[str] | None = None
    ) -> None:
        conn = cache.client.get_client()
        active_key = cls._active_key(user_id)
        redis_ids = session_ids
        if redis_ids is None:
            raw_ids = conn.zrange(active_key, 0, -1)
            redis_ids = [
                rid.decode() if isinstance(rid, bytes) else str(rid) for rid in raw_ids
            ]

        if not redis_ids:
            return

        valid_ids = {
            str(sid)
            for sid in AuthSession.objects.filter(
                user_id=user_id,
                is_active=True,
                expires_at__gt=dj_timezone.now(),
            ).values_list("session_id", flat=True)
        }

        stale_ids = [sid for sid in redis_ids if sid not in valid_ids]
        if not stale_ids:
            return

        conn.zrem(active_key, *stale_ids)
        for sid in stale_ids:
            conn.delete(cls._session_key(sid))

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
        city: str | None = None,
        country_code: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> None:
        now = dj_timezone.now()
        location = cls._normalize_location({
            "city": city,
            "country_code": country_code,
            "lat": latitude,
            "lon": longitude,
        })
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
                "expires_at": expires_at,
                "city": location["city"],
                "country_code": location["country_code"],
                "latitude": location["lat"],
                "longitude": location["lon"],
                "last_seen_at": now,
                "is_active": True,
            },
        )

    @classmethod
    def resolve_current_session(
        cls,
        *,
        user_id: str,
        session_id: str | None = None,
        access_jti: str | None = None,
        fingerprint: str | None = None,
        device_entropy: str | None = None,
        for_update: bool = False,
    ) -> AuthSession | None:
        return cls._get_active_session(
            user_id=user_id,
            session_id=session_id,
            access_jti=access_jti,
            fingerprint=fingerprint,
            device_entropy=device_entropy,
            for_update=for_update,
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
        fingerprint: str | None = None,
        device_entropy: str | None = None,
        for_update: bool = False,
    ) -> AuthSession | None:
        base_query = AuthSession.objects.filter(
            user_id=user_id,
            is_active=True,
            expires_at__gt=dj_timezone.now() - cls.ACTIVITY_GRACE_PERIOD,
        )
        if for_update:
            base_query = base_query.select_for_update()

        # Use stable identifiers in priority order instead of requiring all provided
        # identifiers to match simultaneously. Token rotation and stale partner JTIs
        # should not prevent current-session logout from deactivating the DB session.
        if session_id:
            session = base_query.filter(session_id=session_id).first()
            if session:
                return session
        if access_jti:
            session = base_query.filter(access_jti=access_jti).first()
            if session:
                return session
        if refresh_jti:
            session = base_query.filter(refresh_jti=refresh_jti).first()
            if session:
                return session
        if device_entropy:
            session = (
                base_query.filter(device_entropy=device_entropy)
                .order_by("-last_seen_at")
                .first()
            )
            if session:
                return session
        if fingerprint:
            session = (
                base_query.filter(fingerprint=fingerprint)
                .order_by("-last_seen_at")
                .first()
            )
            if session:
                return session
        return None

    @classmethod
    def _build_restricted_response(
        cls,
        *,
        user_id: str,
        context: Any,
        access_jti: str,
        refresh_jti: str,
        session_id: str,
        location: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = cls._normalize_location(location)
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
            "refresh": cls._create_token(
                user_id=user_id,
                jti=refresh_jti,
                p_jti=access_jti,
                sid=session_id,
                fpt=context.fingerprint,
                t_type="refresh",
                scope="revoke_only",
            ),
            "active_sessions": cls.list_active_sessions(
                user_id=user_id,
                current_sid=session_id,
                current_fingerprint=context.fingerprint,
                current_device_entropy=context.device_entropy,
            ),
            "message": "Maximum device limit reached. Please revoke an existing session to continue.",
        }

    @classmethod
    def _count_active_sessions(cls, user_id: str) -> int:
        return AuthSession.objects.filter(
            user_id=user_id,
            is_active=True,
            expires_at__gt=dj_timezone.now(),
        ).count()

    @classmethod
    def _device_limit(cls) -> int:
        cache_key = "auth:config:max_devices_per_user"
        limit = cache.get(cache_key)
        if limit is None:
            limit = GlobalConfiguration.get_value("max_devices_per_user")
            if limit is None:
                limit = settings.AUTH_ENGINE_SETTINGS["MAX_DEVICES_PER_USER"]
            cache.set(cache_key, limit, timeout=3600)

        limit_int = int(limit)
        # 0 means unlimited
        if limit_int == 0:
            return 999999
        return max(limit_int, 0)

    @staticmethod
    def _session_meta(
        *,
        session_id: str,
        access_jti: str,
        refresh_jti: str,
        context: Any,
        started_at: int,
        location: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_location = AuthEngine._normalize_location(location)
        return {
            "session_id": session_id,
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "device": context.device_label,
            "ip": context.ip_address,
            "started_at": started_at,
            "last_seen_at": AuthEngine._now_ts(),
            "city": normalized_location["city"],
            "country": normalized_location["country_code"],
            "lat": normalized_location["lat"],
            "lon": normalized_location["lon"],
        }

    @staticmethod
    def _normalize_location(
        location: dict[str, Any] | None,
    ) -> dict[str, Any]:
        location = location or {}
        return {
            "city": location.get("city") or "",
            "country_code": location.get("country_code") or "",
            "lat": location.get("lat"),
            "lon": location.get("lon"),
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
        return int(datetime.now(UTC).timestamp())

    @classmethod
    def _check_impossible_travel(
        cls, user_id: str, _context: Any, location: dict[str, Any]
    ) -> bool:
        """
        Detects anomalies by calculating travel velocity between consecutive sessions.
        """
        if not location.get("lat") or not location.get("lon"):
            return False

        last_session = (
            AuthSession.objects.filter(user_id=user_id, is_active=True)
            .order_by("-updated_at")
            .first()
        )
        if not last_session or not last_session.latitude or not last_session.longitude:
            return False

        time_diff = (dj_timezone.now() - last_session.updated_at).total_seconds()
        if (
            time_diff < 30
        ):  # Ignore very rapid consecutive hits (likely parallel requests)
            return False

        velocity = cls._calculate_velocity(
            float(last_session.latitude),
            float(last_session.longitude),
            float(location["lat"]),
            float(location["lon"]),
            time_diff,
        )

        # 800 km/h is roughly the speed of a commercial aircraft.
        if velocity > 800:
            logger.warning(
                "Anomaly: Impossible travel detected for user %s. Velocity: %s km/h.",
                user_id,
                velocity,
            )
            return True
        return False

    @staticmethod
    def _get_location_from_ip(ip_address: str) -> dict[str, Any]:
        """
        Resolves IP address to geographic coordinates using ip-api.com.
        """
        try:
            # We use a 3s timeout to avoid blocking the auth flow
            response = requests.get(f"http://ip-api.com/json/{ip_address}", timeout=3)
            data = response.json()
            if data.get("status") == "success":
                return {
                    "city": data.get("city") or "",
                    "country_code": data.get("countryCode") or "",
                    "lat": data.get("lat"),
                    "lon": data.get("lon"),
                }
        except Exception:
            logger.exception("Geo-IP resolution failed for IP: %s", ip_address)
        return {"city": "", "country_code": "", "lat": None, "lon": None}

    @staticmethod
    def _calculate_velocity(
        lat1: float, lon1: float, lat2: float, lon2: float, time_diff_seconds: float
    ) -> float:
        """
        Calculates travel velocity in km/h using the Haversine formula.
        """
        if time_diff_seconds <= 0:
            return 0.0

        radius_km = 6371.0

        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)

        a = (
            sin(dlat / 2) ** 2
            + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        )
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance = radius_km * c

        hours = time_diff_seconds / 3600.0
        return distance / hours
