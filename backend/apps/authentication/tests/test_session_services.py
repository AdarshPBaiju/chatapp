from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch
from users.models import CustomUser, Client
from authentication.sessions.application.services import (
    SessionManager,
    SessionQueryService,
    AnomalyDetectionService,
)
from authentication.sessions.infrastructure.models import AuthSession
import uuid


class SessionServicesTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="sessions@example.com", password="password123", is_active=True
        )
        Client.objects.create(user=self.user, full_name="Session Tester")

    def test_persist_session_new_and_update(self):
        session_id = str(uuid.uuid4())
        expires_at = timezone.now() + timedelta(hours=1)

        # Test Persist New
        session = SessionManager.persist_session(
            user=self.user,
            session_id=session_id,
            access_jti="a1",
            refresh_jti="r1",
            fingerprint="f1",
            device_label="Chrome",
            device_entropy="e1",
            ip_address="127.0.0.1",
            expires_at=expires_at,
        )
        self.assertEqual(AuthSession.objects.count(), 1)
        self.assertEqual(session.access_jti, "a1")

        # Test Update existing (Grace JTI registration)
        with patch(
            "authentication.identity.infrastructure.cache.GraceJTIService.register_grace_jti"
        ) as grace_mock:
            SessionManager.persist_session(
                user=self.user,
                session_id=session_id,
                access_jti="a2",
                refresh_jti="r2",
                fingerprint="f1",
                device_label="Chrome",
                device_entropy="e1",
                ip_address="127.0.0.1",
                expires_at=expires_at,
            )
            # Should have registered a1 as grace
            grace_mock.assert_any_call(session_id, "a1")

    def test_revoke_all_sessions(self):
        SessionManager.persist_session(
            user=self.user,
            session_id=str(uuid.uuid4()),
            access_jti="a1",
            refresh_jti="r1",
            fingerprint="f1",
            device_label="D1",
            device_entropy="e1",
            ip_address="1.1.1.1",
            expires_at=timezone.now() + timedelta(hours=1),
        )
        SessionManager.persist_session(
            user=self.user,
            session_id=str(uuid.uuid4()),
            access_jti="a2",
            refresh_jti="r2",
            fingerprint="f2",
            device_label="D2",
            device_entropy="e2",
            ip_address="2.2.2.2",
            expires_at=timezone.now() + timedelta(hours=1),
        )

        self.assertEqual(
            AuthSession.objects.filter(user=self.user, is_active=True).count(), 2
        )

        with patch(
            "authentication.identity.infrastructure.cache.RedisSessionStore.remove_session"
        ):
            count = SessionManager.revoke_all_sessions(str(self.user.id))
            self.assertEqual(count, 2)
            self.assertEqual(
                AuthSession.objects.filter(user=self.user, is_active=True).count(), 0
            )

    def test_anomaly_detection_impossible_travel(self):
        # Create a session in New York
        AuthSession.objects.create(
            user=self.user,
            session_id=uuid.uuid4(),
            access_jti="a1",
            refresh_jti="r1",
            fingerprint="f1",
            device_label="D1",
            device_entropy="e1",
            ip_address="1.1.1.1",
            expires_at=timezone.now() + timedelta(hours=1),
            latitude=40.7128,
            longitude=-74.0060,  # NYC
            last_seen_at=timezone.now() - timedelta(minutes=10),
        )

        # New attempt from London (5500+ km away) after 10 mins
        # Dist ~5500km, Time 0.16h -> Speed ~33000 km/h (Impossible)
        current_loc = {"lat": 51.5074, "lon": -0.1278}  # London

        class MockRequest:
            META = {"HTTP_USER_AGENT": "Mozilla/5.0"}

        with patch(
            "authentication.sessions.infrastructure.cache.GeoLocationService.calculate_distance",
            return_value=5585,
        ):
            score = AnomalyDetectionService.calculate_risk_score(
                str(self.user.id), MockRequest(), current_loc
            )
            self.assertGreaterEqual(score, 80)

    def test_geo_location_service_caching(self):
        from authentication.sessions.infrastructure.cache import GeoLocationService

        ip = "8.8.8.8"

        # Test Fresh Call (Mocking requests)
        with patch("requests.get") as mock_get:
            mock_get.return_value.json.return_value = {
                "status": "success",
                "city": "Mountain View",
                "countryCode": "US",
                "lat": 37.4,
                "lon": -122.1,
            }
            res = GeoLocationService.get_location_from_ip(ip)
            self.assertEqual(res["city"], "Mountain View")

        # Test Cache Hit (No requests)
        with patch("requests.get") as mock_get:
            res = GeoLocationService.get_location_from_ip(ip)
            mock_get.assert_not_called()
            self.assertEqual(res["city"], "Mountain View")

    def test_geo_location_fallback(self):
        from authentication.sessions.infrastructure.cache import GeoLocationService

        # Test error fallback
        with patch("requests.get", side_effect=Exception("API Down")):
            res = GeoLocationService.get_location_from_ip("1.1.1.1")
            self.assertEqual(res["city"], "")
            self.assertIsNone(res["lat"])

    def test_haversine_calculation(self):
        from authentication.sessions.infrastructure.cache import GeoLocationService

        # NYC to London is roughly 5570km
        dist = GeoLocationService.calculate_distance(
            40.7128, -74.0060, 51.5074, -0.1278
        )
        self.assertGreater(dist, 5500)
        self.assertLess(dist, 5600)

    def test_session_query_active_check(self):
        session_id = uuid.uuid4()
        SessionManager.persist_session(
            user=self.user,
            session_id=session_id,
            access_jti="a1",
            refresh_jti="r1",
            fingerprint="f1",
            device_label="D1",
            device_entropy="e1",
            ip_address="1.1.1.1",
            expires_at=timezone.now() + timedelta(hours=1),
        )

        # Test active check
        is_active = SessionQueryService.is_session_active(
            user_id=str(self.user.id),
            session_id=str(session_id),
            jti="a1",
            token_type="access",
        )
        self.assertTrue(is_active, f"Session {session_id} should be active for user {self.user.id}")

        # Test listing
        sessions = SessionQueryService.list_active_sessions(user_id=str(self.user.id))
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["session_id"], session_id)
