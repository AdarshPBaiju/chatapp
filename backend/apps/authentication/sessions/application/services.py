import logging
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone as dj_timezone

from authentication.sessions.infrastructure.models import AuthSession

logger = logging.getLogger("core")


class SessionManager:
    @classmethod
    def persist_session(
        cls,
        *,
        user: Any,
        session_id: str,
        access_jti: str,
        refresh_jti: str,
        fingerprint: str,
        device_label: str,
        device_entropy: str,
        ip_address: str,
        expires_at: datetime,
        location_data: dict[str, Any] | None = None,
        session_type: str = "client",
    ) -> AuthSession:
        from authentication.sessions.infrastructure.cache import GeoLocationService

        location = GeoLocationService.normalize_location(location_data)

        session, _ = AuthSession.objects.update_or_create(
            user=user,
            session_id=session_id,
            defaults={
                "session_type": session_type,
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
                "last_seen_at": dj_timezone.now(),
                "is_active": True,
            },
        )
        return session

    @classmethod
    @transaction.atomic
    def logout(
        cls,
        user_id: str,
        access_jti: str,
        refresh_jti: str,
        session_id: str | None = None,
    ) -> None:
        from authentication.identity.infrastructure.cache import TokenBlacklistService
        from authentication.sessions.application.services import SessionQueryService
        from authentication.identity.infrastructure.cache import RedisSessionStore

        TokenBlacklistService.blacklist_tokens([access_jti, refresh_jti])

        session = SessionQueryService.get_active_session(
            user_id=user_id,
            session_id=session_id,
            refresh_jti=refresh_jti,
            access_jti=access_jti,
        )
        if session:
            session.is_active = False
            session.last_seen_at = dj_timezone.now()
            session.save(update_fields=["is_active", "last_seen_at", "updated_at"])
            RedisSessionStore.remove_session(
                user_id=user_id, session_id=str(session.session_id)
            )
            logger.info(
                "session_revoked",
                extra={"user_id": user_id, "session_id": str(session.session_id)},
            )

    @classmethod
    def revoke_all_sessions(
        cls, user_id: str, exclude_session_id: str | None = None
    ) -> int:
        with transaction.atomic():
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
    def revoke_session(
        cls,
        *,
        user_id: str,
        session_id: str | None = None,
        access_jti: str | None = None,
    ) -> bool:
        session = SessionQueryService.get_active_session(
            user_id=user_id,
            session_id=session_id,
            access_jti=access_jti,
            allow_context_fallback=False,
        )
        if not session:
            return False

        cls.logout(
            user_id=user_id,
            access_jti=session.access_jti,
            refresh_jti=session.refresh_jti,
            session_id=str(session.session_id),
        )
        return True


class SessionQueryService:
    ACTIVITY_GRACE_PERIOD = timedelta(minutes=5)

    @staticmethod
    def _active_sessions_query(user_id: str, *, use_grace_period: bool = False):
        threshold = (
            dj_timezone.now() - SessionQueryService.ACTIVITY_GRACE_PERIOD
            if use_grace_period
            else dj_timezone.now()
        )
        return AuthSession.objects.filter(
            user_id=user_id,
            is_active=True,
            expires_at__gt=threshold,
        )

    @classmethod
    def count_active_sessions(cls, user_id: str) -> int:
        return cls._active_sessions_query(user_id).count()

    @classmethod
    def get_active_session(
        cls,
        user_id: str,
        session_id: str | None = None,
        access_jti: str | None = None,
        refresh_jti: str | None = None,
        allow_context_fallback: bool = True,
        require_all_identifiers: bool = False,
    ) -> AuthSession | None:
        base_query = cls._active_sessions_query(user_id, use_grace_period=True)

        if require_all_identifiers:
            if not session_id or not (access_jti or refresh_jti):
                return None
            if access_jti:
                base_query = base_query.filter(
                    session_id=session_id, access_jti=access_jti
                )
            if refresh_jti:
                base_query = base_query.filter(
                    session_id=session_id, refresh_jti=refresh_jti
                )
        else:
            if session_id:
                base_query = base_query.filter(session_id=session_id)
            if access_jti:
                base_query = base_query.filter(access_jti=access_jti)
            if refresh_jti:
                base_query = base_query.filter(refresh_jti=refresh_jti)

        session = base_query.first()
        if session or not allow_context_fallback:
            return session

        from authentication.core.request_context import get_current_session_id

        ctx_sid = get_current_session_id()
        if ctx_sid:
            return AuthSession.objects.filter(
                user_id=user_id,
                session_id=ctx_sid,
                is_active=True,
                expires_at__gt=dj_timezone.now() - cls.ACTIVITY_GRACE_PERIOD,
            ).first()

        return None

    @classmethod
    def list_active_sessions(
        cls,
        *,
        user_id: str,
        current_sid: str | None = None,
        current_access_jti: str | None = None,
        current_fingerprint: str | None = None,
        current_device_entropy: str | None = None,
    ) -> list[dict[str, Any]]:
        from authentication.identity.infrastructure.cache import RedisSessionStore

        sessions = (
            cls._active_sessions_query(user_id)
            .order_by("-last_seen_at", "-created_at")
            .all()
        )

        results: list[dict[str, Any]] = []
        for session in sessions:
            is_current = (
                (current_sid and str(session.session_id) == str(current_sid))
                or (current_access_jti and session.access_jti == current_access_jti)
                or (
                    current_fingerprint
                    and current_device_entropy is not None
                    and session.fingerprint == current_fingerprint
                    and session.device_entropy == current_device_entropy
                )
            )

            results.append({
                "session_id": str(session.session_id),
                "access_jti": session.access_jti,
                "refresh_jti": session.refresh_jti,
                "device": session.device_label,
                "started_at": int(session.started_at.timestamp()),
                "last_seen_at": int(session.last_seen_at.timestamp()),
                "is_current": is_current,
                "city": session.city or "",
                "country_code": session.country_code or "",
                "expires_at": int(session.expires_at.timestamp()),
            })

        RedisSessionStore.sync_active_sessions(user_id, results)
        return results

    @classmethod
    def is_session_active(
        cls,
        user_id: str,
        session_id: str,
        jti: str,
        partner_jti: str | None = None,
        scope: str | None = None,
    ) -> bool:
        from authentication.identity.infrastructure.cache import TokenBlacklistService

        if TokenBlacklistService.is_blacklisted(jti):
            return False
        if partner_jti and TokenBlacklistService.is_blacklisted(partner_jti):
            return False

        if scope == "revoke_only":
            return True

        session = cls.get_active_session(
            user_id=user_id,
            session_id=session_id,
            access_jti=jti if scope != "refresh" else None,
            refresh_jti=jti if scope == "refresh" else None,
            allow_context_fallback=False,
            require_all_identifiers=True,
        )
        return bool(session)


class AnomalyDetectionService:
    @staticmethod
    def check_impossible_travel(
        user_id: str, current_location: dict[str, Any], **_kwargs: Any
    ) -> bool:
        """
        Detects if a login attempt is coming from a location that is geographically
        implausible given the last known activity.
        """
        last_session = (
            AuthSession.objects.filter(user_id=user_id, is_active=True)
            .order_by("-last_seen_at")
            .first()
        )

        if not last_session or not last_session.latitude or not last_session.longitude:
            return False

        if not current_location.get("lat") or not current_location.get("lon"):
            return False

        from authentication.sessions.infrastructure.cache import GeoLocationService

        dist = GeoLocationService.calculate_distance(
            float(last_session.latitude),
            float(last_session.longitude),
            float(current_location["lat"]),
            float(current_location["lon"]),
        )

        if dist < 10:  # Ignore small movements
            return False

        time_diff = (
            dj_timezone.now() - last_session.last_seen_at
        ).total_seconds() / 3600
        if time_diff < 0.01:  # Practically simultaneous
            return True

        speed = dist / time_diff
        if speed > 800:  # Faster than a commercial jet
            logger.warning(
                "impossible_travel_detected",
                extra={
                    "user_id": user_id,
                    "distance": dist,
                    "speed": speed,
                    "hours": time_diff,
                },
            )
            return True

        return False
