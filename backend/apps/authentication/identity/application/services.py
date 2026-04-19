import hashlib
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.core.cache import cache
from django.utils import timezone as dj_timezone
from authentication.core.crypto import AuthCryptoEngine
from authentication.core.request_context import (
    get_device_entropy,
    build_auth_request_context,
)
from authentication.identity.infrastructure.cache import (
    TokenBlacklistService,
    RedisSessionStore,
)
from authentication.sessions.application.services import (
    SessionQueryService,
    SessionManager,
)
from authentication.core.device_registry import DeviceRegistryService
from authentication.sessions.infrastructure.cache import GeoLocationService


logger = logging.getLogger("core")


class TokenIssueService:
    @classmethod
    def issue_tokens(
        cls,
        user: Any,
        session_id: str,
        fingerprint: str,
        scope: str = "full",
        ttl_minutes: int | None = None,
        access_jti: str | None = None,
        refresh_jti: str | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        access_jti = access_jti or str(uuid.uuid4())
        refresh_jti = refresh_jti or str(uuid.uuid4())

        access_exp = (
            now + timedelta(minutes=ttl_minutes)
            if ttl_minutes is not None
            else now
            + timedelta(seconds=settings.AUTH_ENGINE_SETTINGS["ACCESS_TOKEN_LIFETIME"])
        )
        refresh_exp = now + timedelta(
            seconds=settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        )

        access_payload = {
            "sub": str(user.id),
            "user_id": str(user.id),
            "jti": access_jti,
            "partner_jti": refresh_jti,
            "sid": session_id,
            "fpt": fingerprint,
            "type": "access",
            "scope": scope,
            "exp": int(access_exp.timestamp()),
        }

        refresh_payload = {
            "sub": str(user.id),
            "user_id": str(user.id),
            "jti": refresh_jti,
            "partner_jti": access_jti,
            "sid": session_id,
            "fpt": fingerprint,
            "type": "refresh",
            "scope": scope,
            "exp": int(refresh_exp.timestamp()),
        }

        return {
            "access": AuthCryptoEngine.encrypt_and_sign(
                access_payload,
                ttl_seconds=int((access_exp - now).total_seconds()),
            ),
            "refresh": AuthCryptoEngine.encrypt_and_sign(
                refresh_payload,
                ttl_seconds=int((refresh_exp - now).total_seconds()),
            ),
            "access_exp": int(access_exp.timestamp()),
            "refresh_exp": int(refresh_exp.timestamp()),
            "session_id": session_id,
            "jti": access_jti,
            "partner_jti": refresh_jti,
        }


class TokenRotateService:
    @classmethod
    def refresh_tokens(
        cls, user: Any, refresh_payload: dict[str, Any], request
    ) -> dict[str, Any]:
        user_id = str(user.id)
        session_id = refresh_payload["sid"]
        refresh_jti = refresh_payload["jti"]
        access_jti = refresh_payload["partner_jti"]
        from authentication.identity.infrastructure.cache import (
            RedisSessionStore,
            RefreshGraceService,
        )

        session = SessionQueryService.get_active_session(
            user_id=user_id,
            session_id=session_id,
            refresh_jti=refresh_jti,
            access_jti=access_jti,
            allow_context_fallback=False,
            require_all_identifiers=True,
        )

        if not session:
            inherited = RefreshGraceService.get_rotated_result(refresh_jti)
            if inherited:
                return inherited

            if TokenBlacklistService.is_blacklisted(refresh_jti):
                logger.critical(
                    "refresh_token_reuse_detected",
                    extra={
                        "user_id": user_id,
                        "session_id": session_id,
                        "jti": refresh_jti,
                    },
                )
                # Revoke the entire session family to stop the attacker
                SessionManager.revoke_session(user_id=user_id, session_id=session_id)
                raise ValueError("Security breach: Token reuse detected. Session revoked.")

            TokenBlacklistService.blacklist_tokens([refresh_jti, access_jti])
            raise ValueError("Session context not found or already revoked.")

        TokenBlacklistService.blacklist_tokens([refresh_jti, access_jti])

        context = build_auth_request_context(request)
        now_ts = int(time.time())

        device_limit = DeviceRegistryService.get_device_limit()
        active_sessions = SessionQueryService.count_active_sessions(user_id)

        if device_limit > 0 and active_sessions > device_limit:
            new_access_jti = str(uuid.uuid4())
            new_refresh_jti = str(uuid.uuid4())

            SessionManager.persist_session(
                user=user,
                session_id=session_id,
                access_jti=new_access_jti,
                refresh_jti=new_refresh_jti,
                fingerprint=context.fingerprint,
                device_label=context.device_label,
                device_entropy=context.device_entropy,
                ip_address=context.ip_address,
                expires_at=dj_timezone.now() + timedelta(minutes=15),
                location_data={
                    "city": session.city,
                    "country_code": session.country_code,
                },
                session_type=session.session_type,
            )

            result = LoginService.build_restricted_response(
                user_id=user_id,
                context=context,
                access_jti=new_access_jti,
                refresh_jti=new_refresh_jti,
                session_id=session_id,
            )
            RefreshGraceService.register_rotated_result(refresh_jti, result)
            return result

        tokens = TokenIssueService.issue_tokens(
            user=user,
            session_id=session_id,
            fingerprint=context.fingerprint,
        )

        SessionManager.persist_session(
            user=user,
            session_id=session_id,
            access_jti=tokens["jti"],
            refresh_jti=tokens["partner_jti"],
            fingerprint=context.fingerprint,
            device_label=context.device_label,
            device_entropy=context.device_entropy,
            ip_address=context.ip_address,
            expires_at=datetime.fromtimestamp(tokens["refresh_exp"], tz=UTC),
            location_data={"city": session.city, "country_code": session.country_code},
            session_type=session.session_type,
        )

        # Sync with Redis Registry (Promote or Update)
        session_meta = {
            "session_id": session_id,
            "access_jti": tokens["jti"],
            "refresh_jti": tokens["partner_jti"],
            "device": context.device_label,
            "ip": context.ip_address,
            "started_at": int(session.started_at.timestamp()),
            "last_seen_at": now_ts,
            "city": session.city,
            "country": session.country_code,
            "lat": float(session.latitude) if session.latitude else None,
            "lon": float(session.longitude) if session.longitude else None,
            "type": session.session_type,
        }

        register_res = RedisSessionStore.update_session(
            user_id=user_id,
            session_id=session_id,
            session_meta=session_meta,
            refresh_expiry_ts=tokens["refresh_exp"],
            now_ts=now_ts,
        )
        if register_res != "SUCCESS":
            # Promotion case: Session wasn't in Redis ZSET yet
            RedisSessionStore.register_session(
                user_id=user_id,
                session_id=session_id,
                session_meta=session_meta,
                refresh_expiry_ts=tokens["refresh_exp"],
                device_limit=DeviceRegistryService.get_device_limit(),
                now_ts=now_ts,
            )

        DeviceRegistryService.sync_device_registry(user, context)

        final_result = {
            "status": "full",
            **tokens,
        }
        RefreshGraceService.register_rotated_result(refresh_jti, final_result)
        return final_result

    @classmethod
    def promote_restricted_session(
        cls, user_id: str, access_jti: str, refresh_jti: str, session_id: str, request
    ) -> dict[str, Any]:
        from users.models import CustomUser
        from authentication.sessions.infrastructure.models import AuthSession

        session = AuthSession.objects.filter(
            user_id=user_id, session_id=session_id, is_active=True
        ).first()
        active_sessions = SessionQueryService.count_active_sessions(user_id)
        device_limit = DeviceRegistryService.get_device_limit()
        if device_limit > 0:
            if session:
                if active_sessions > device_limit:
                    raise ValueError("Device limit still exceeded.")
            elif active_sessions >= device_limit:
                raise ValueError("Device limit still exceeded.")

        context = build_auth_request_context(request)

        user = (
            session.user
            if session
            else CustomUser.objects.get(id=user_id, is_active=True)
        )
        tokens = TokenIssueService.issue_tokens(
            user=user,
            session_id=session_id,
            fingerprint=context.fingerprint,
        )

        TokenBlacklistService.blacklist_tokens([access_jti, refresh_jti])

        location = (
            {"city": session.city, "country_code": session.country_code}
            if session
            else GeoLocationService.normalize_location(
                GeoLocationService.get_location_from_ip(context.ip_address)
            )
        )
        session_type = session.session_type if session else "client"
        now_ts = int(datetime.now(UTC).timestamp())
        refresh_expiry_ts = tokens["refresh_exp"]
        session_meta = {
            "session_id": session_id,
            "access_jti": tokens["jti"],
            "refresh_jti": tokens["partner_jti"],
            "device": context.device_label,
            "ip": context.ip_address,
            "started_at": now_ts,
            "last_seen_at": now_ts,
            "city": location["city"],
            "country": location["country_code"],
            "lat": location.get("lat"),
            "lon": location.get("lon"),
            "type": session_type,
        }

        redis_res = RedisSessionStore.update_session(
            user_id=user_id,
            session_id=session_id,
            session_meta=session_meta,
            refresh_expiry_ts=refresh_expiry_ts,
            now_ts=now_ts,
        )
        if redis_res != "SUCCESS":
            redis_res = RedisSessionStore.register_session(
                user_id=user_id,
                session_id=session_id,
                session_meta=session_meta,
                refresh_expiry_ts=refresh_expiry_ts,
                device_limit=DeviceRegistryService.get_device_limit(),
                now_ts=now_ts,
            )
            if redis_res != "SUCCESS":
                raise ValueError("Unable to promote session due to device limit.")

        SessionManager.persist_session(
            user=user,
            session_id=session_id,
            access_jti=tokens["jti"],
            refresh_jti=tokens["partner_jti"],
            fingerprint=context.fingerprint,
            device_label=context.device_label,
            device_entropy=context.device_entropy,
            ip_address=context.ip_address,
            expires_at=datetime.fromtimestamp(tokens["refresh_exp"], tz=UTC),
            location_data=location,
            session_type=session_type,
        )

        DeviceRegistryService.sync_device_registry(user, context)

        return {
            "status": "full",
            **tokens,
        }


class LoginService:
    @classmethod
    def issue_tokens(
        cls, user: Any, request: Any, session_type: str = "client"
    ) -> dict[str, Any]:
        user_id = str(user.id)
        context = build_auth_request_context(request)
        location_data = GeoLocationService.get_location_from_ip(context.ip_address)
        location = GeoLocationService.normalize_location(location_data)
        existing_session = cls._get_existing_device_session(user_id, context)

        now_ts = int(datetime.now(UTC).timestamp())
        refresh_ttl = settings.AUTH_ENGINE_SETTINGS["REFRESH_TOKEN_LIFETIME"]
        refresh_expiry_ts = now_ts + refresh_ttl

        session_id = (
            str(existing_session.session_id) if existing_session else str(uuid.uuid4())
        )
        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())

        session_meta = {
            "session_id": session_id,
            "access_jti": access_jti,
            "refresh_jti": refresh_jti,
            "device": context.device_label,
            "ip": context.ip_address,
            "started_at": now_ts,
            "last_seen_at": now_ts,
            "city": location["city"],
            "country": location["country_code"],
            "lat": location["lat"],
            "lon": location["lon"],
            "type": session_type,
        }

        if existing_session:
            register_res = RedisSessionStore.update_session(
                user_id=user_id,
                session_id=session_id,
                session_meta=session_meta,
                refresh_expiry_ts=refresh_expiry_ts,
                now_ts=now_ts,
            )
            if register_res != "SUCCESS":
                register_res = RedisSessionStore.register_session(
                    user_id=user_id,
                    session_id=session_id,
                    session_meta=session_meta,
                    refresh_expiry_ts=refresh_expiry_ts,
                    device_limit=DeviceRegistryService.get_device_limit(),
                    now_ts=now_ts,
                )
        else:
            register_res = RedisSessionStore.register_session(
                user_id=user_id,
                session_id=session_id,
                session_meta=session_meta,
                refresh_expiry_ts=refresh_expiry_ts,
                device_limit=DeviceRegistryService.get_device_limit(),
                now_ts=now_ts,
            )

        if register_res != "SUCCESS":
            with transaction.atomic():
                SessionManager.persist_session(
                    user=user,
                    session_id=session_id,
                    access_jti=access_jti,
                    refresh_jti=refresh_jti,
                    fingerprint=context.fingerprint,
                    device_label=context.device_label,
                    device_entropy=context.device_entropy,
                    ip_address=context.ip_address,
                    expires_at=datetime.fromtimestamp(refresh_expiry_ts, tz=UTC),
                    location_data=location,
                    session_type=session_type,
                )
                DeviceRegistryService.sync_device_registry(user, context)

            return cls.build_restricted_response(
                user_id=user_id,
                context=context,
                access_jti=access_jti,
                refresh_jti=refresh_jti,
                session_id=session_id,
                location=location,
                session_type=session_type,
            )

        try:
            with transaction.atomic():
                SessionManager.persist_session(
                    user=user,
                    session_id=session_id,
                    access_jti=access_jti,
                    refresh_jti=refresh_jti,
                    fingerprint=context.fingerprint,
                    device_label=context.device_label,
                    device_entropy=context.device_entropy,
                    ip_address=context.ip_address,
                    expires_at=datetime.fromtimestamp(refresh_expiry_ts, tz=UTC),
                    location_data=location,
                    session_type=session_type,
                )

                DeviceRegistryService.sync_device_registry(user, context)

                tokens = TokenIssueService.issue_tokens(
                    user=user,
                    session_id=session_id,
                    fingerprint=context.fingerprint,
                    scope="full",
                    access_jti=access_jti,
                    refresh_jti=refresh_jti,
                )
        except Exception:
            RedisSessionStore.remove_session(user_id=user_id, session_id=session_id)
            raise

        return {
            "status": "full",
            **tokens,
        }

    @classmethod
    def build_restricted_response(
        cls,
        *,
        user_id: str,
        context: Any,
        access_jti: str,
        refresh_jti: str,
        session_id: str,
        location: dict[str, Any] | None = None,
        session_type: str = "client",
    ) -> dict[str, Any]:
        from users.models import CustomUser

        # Restricted tokens live for 15 mins
        restricted_user = (
            cache.get(f"user_obj:{user_id}")
            or CustomUser.objects.filter(id=user_id).first()
        )
        tokens = TokenIssueService.issue_tokens(
            user=restricted_user or type("User", (), {"id": user_id})(),
            session_id=session_id,
            fingerprint=context.fingerprint,
            scope="revoke_only",
            ttl_minutes=15,
            access_jti=access_jti,
            refresh_jti=refresh_jti,
        )

        return {
            "status": "restricted",
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "access_exp": tokens["access_exp"],
            "refresh_exp": tokens["refresh_exp"],
            "active_sessions": SessionQueryService.list_active_sessions(
                user_id=user_id,
                current_sid=session_id,
                current_fingerprint=context.fingerprint,
                current_device_entropy=context.device_entropy,
            ),
            "message": "Maximum device limit reached. Please revoke an existing session to continue.",
        }

    @staticmethod
    def _get_existing_device_session(user_id: str, context: Any):
        from authentication.sessions.infrastructure.models import AuthSession

        return AuthSession.objects.filter(
            user_id=user_id,
            fingerprint=context.fingerprint,
            device_entropy=context.device_entropy,
            is_active=True,
            expires_at__gt=datetime.now(UTC),
        ).first()


class HitEngine:
    ATOMIC_HIT_VERIFY_LUA = """
    local flow_key = KEYS[1]
    local jti = ARGV[1]
    local expected_step = tonumber(ARGV[2])

    if redis.call('EXISTS', flow_key) == 0 then
        return 'EXPIRED_FLOW'
    end

    local is_used = redis.call('HGET', flow_key, 'used_jti:' .. jti)
    if is_used == '1' then
        redis.call('DEL', flow_key)
        return 'REPLAY_VIOLATION'
    end

    local current_step = tonumber(redis.call('HGET', flow_key, 'step'))
    if current_step ~= expected_step then
        return 'STEP_VIOLATION'
    end

    redis.call('HSET', flow_key, 'used_jti:' .. jti, '1')
    redis.call('HINCRBY', flow_key, 'step', 1)
    return 'SUCCESS'
    """

    @classmethod
    def generate_device_hash(cls, request: Any) -> str:
        entropy = get_device_entropy(request) or "unknown"
        user_agent = request.META.get("HTTP_USER_AGENT", "unknown")
        msg = f"{entropy}:{user_agent}".encode()
        return hashlib.sha256(msg).hexdigest()

    @classmethod
    def create_initial_flow(
        cls, user_id: str, request: Any, expected_step: int = 1, initial_acr: int = 0
    ) -> dict[str, Any]:
        flow_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        dev_hash = cls.generate_device_hash(request)

        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{flow_id}"

        pipe = redis_client.pipeline()
        pipe.hset(flow_key, "step", str(expected_step))
        pipe.hset(flow_key, "attempts", "0")
        pipe.expire(flow_key, 300)
        pipe.execute()

        payload = {
            "sub": str(user_id),
            "jti": jti,
            "flow_id": flow_id,
            "amr": [],
            "acr": initial_acr,
            "step_counter": expected_step,
            "dev_hash": dev_hash,
            "type": "hit",
        }

        hit_token = AuthCryptoEngine.encrypt_and_sign(payload, 300)

        return {
            "hit": hit_token,
            "flow_id": flow_id,
            "step_counter": expected_step,
        }

    @classmethod
    def create_fake_flow(
        cls, email: str, request: Any, expected_step: int = 1
    ) -> dict[str, Any]:
        """Creates a simulated flow to prevent account enumeration."""
        flow_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        dev_hash = cls.generate_device_hash(request)

        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{flow_id}"

        pipe = redis_client.pipeline()
        pipe.hset(flow_key, "step", str(expected_step))
        pipe.hset(flow_key, "is_fake", "1")
        pipe.hset(flow_key, "attempts", "0")
        pipe.expire(flow_key, 300)
        pipe.execute()

        payload = {
            "sub": "00000000-0000-0000-0000-000000000000",  # Null user
            "jti": jti,
            "flow_id": flow_id,
            "amr": [],
            "acr": 0,
            "step_counter": expected_step,
            "dev_hash": dev_hash,
            "type": "hit",
            "is_fake": True,
        }

        hit_token = AuthCryptoEngine.encrypt_and_sign(payload, 300)

        return {
            "hit": hit_token,
            "flow_id": flow_id,
            "step_counter": expected_step,
        }

    @classmethod
    def verify_and_advance_hit(
        cls, hit_token: str, request: Any, expected_step: int
    ) -> dict[str, Any]:
        try:
            payload = AuthCryptoEngine.decrypt_and_verify(hit_token)
        except Exception as e:
            raise ValueError("Token compromised or expired.") from e

        if payload.get("type") != "hit":
            raise ValueError("Invalid token context.")

        inc_dev_hash = cls.generate_device_hash(request)
        if payload.get("dev_hash") != inc_dev_hash:
            raise ValueError("Device Context Interrupted. Login Reset.")

        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{payload['flow_id']}"
        res = redis_client.eval(
            cls.ATOMIC_HIT_VERIFY_LUA, 1, flow_key, payload["jti"], expected_step
        )

        result_str = res.decode() if isinstance(res, bytes) else str(res)

        if result_str == "EXPIRED_FLOW":
            raise ValueError("Authentication flow has timed out.")
        if result_str == "REPLAY_VIOLATION":
            raise ValueError("Token reuse detected. Flow destroyed.")
        if result_str == "STEP_VIOLATION":
            raise ValueError("Race condition or out-of-order execution detected.")
        if result_str != "SUCCESS":
            raise ValueError("Unknown gateway rejection.")

        # Propagate is_fake from redis if it exists
        is_fake = redis_client.hget(flow_key, "is_fake")
        if is_fake in {b"1", "1"}:
            payload["is_fake"] = True

        return payload

    @classmethod
    def issue_next_hit(
        cls, previous_payload: dict[str, Any], amr_adds: list[str], target_acr: int
    ) -> str:
        jti = str(uuid.uuid4())
        amr_set = set(previous_payload.get("amr", []))
        amr_set.update(amr_adds)

        payload = {
            "sub": previous_payload["sub"],
            "jti": jti,
            "flow_id": previous_payload["flow_id"],
            "amr": list(amr_set),
            "acr": target_acr,
            "step_counter": previous_payload["step_counter"] + 1,
            "dev_hash": previous_payload["dev_hash"],
            "type": "hit",
            "is_fake": previous_payload.get("is_fake", False),
        }

        elapsed = time.time() - previous_payload.get("iat", time.time())
        remaining_ttl = int(max(300 - elapsed, 30))

        return AuthCryptoEngine.encrypt_and_sign(payload, remaining_ttl)

    @classmethod
    def increment_flow_failures(cls, flow_id: str) -> None:
        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{flow_id}"
        attempts = redis_client.hincrby(flow_key, "attempts", 1)
        if attempts >= 5:
            redis_client.delete(flow_key)
            raise ValueError("Flow locked due to excessive invalid iterations.")
