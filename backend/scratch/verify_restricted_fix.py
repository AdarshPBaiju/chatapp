import os
import django
from datetime import timedelta
from django.utils import timezone as dj_timezone
import uuid

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from users.models import CustomUser, AuthSession
from users.services.auth_engine import AuthEngine
from core.auth.token_validator import validate_token_for_request

def test_restricted_session_validation():
    print("--- Testing Restricted Session Validation ---")
    user = CustomUser.objects.filter(is_active=True).first()
    if not user:
        print("No user found.")
        return

    # 1. Manually create a Restricted response (simulating limit hit)
    class MockContext:
        ip_address = "127.0.0.1"
        fingerprint = "mock-fingerprint"
        device_label = "Mock Device"
        device_entropy = "mock-entropy"

    # We use a session ID that is NOT in the DB
    session_id = str(uuid.uuid4())
    access_jti = str(uuid.uuid4())
    refresh_jti = str(uuid.uuid4())
    
    print(f"Creating Restricted tokens for session_id: {session_id}")
    restricted_resp = AuthEngine._build_restricted_response(
        user_id=str(user.id),
        context=MockContext(),
        access_jti=access_jti,
        refresh_jti=refresh_jti,
        session_id=session_id
    )

    access_token = restricted_resp["access"]
    refresh_token = restricted_resp["refresh"]

    # 2. Verify that validation passes despite the session not being in the DB
    print("Validating restricted access token (should pass)...")
    try:
        # We need a mock request for validate_token_for_request
        class MockRequest:
            META = {
                "HTTP_X_TIMEZONE_OFFSET": "0",
                "REMOTE_ADDR": "127.0.0.1",
                "HTTP_USER_AGENT": "Mock Agent"
            }
            COOKIES = {"device_entropy": "mock-entropy"}
            
        payload = validate_token_for_request(
            MockRequest(),
            access_token,
            check_session=True
        )
        print("SUCCESS: Restricted token validated without DB record.")
    except Exception as e:
        print(f"FAILURE: {e}")
        return

    # 3. Verify that refresh works (rotation)
    print("Refreshing restricted token (should pass and preserve scope)...")
    try:
        # Resolve user since validate_token normally happens in middleware
        refresh_payload = validate_token_for_request(
            MockRequest(),
            refresh_token,
            expected_type="refresh",
            check_session=True
        )
        
        # In the real API, view gets the user from payload
        new_tokens = AuthEngine.refresh_tokens(user, refresh_payload, MockRequest())
        
        if new_tokens["status"] == "restricted":
            print("SUCCESS: Restricted token rotated and preserved status.")
        else:
            print(f"FAILURE: Status changed to {new_tokens['status']}")
            
    except Exception as e:
        print(f"FAILURE during refresh: {e}")

if __name__ == "__main__":
    test_restricted_session_validation()
