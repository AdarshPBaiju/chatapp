import hmac
import hashlib
from django.conf import settings

def get_deterministic_masked_email(user_uuid: str) -> str:
    """
    Generates a deterministic, immutable masked email for a user.
    Uses HMAC-SHA256 with the server's SECRET_KEY to ensure uniqueness and stability.
    """
    # Use the Django SECRET_KEY as the HMAC key
    key = settings.SECRET_KEY.encode('utf-8')
    msg = str(user_uuid).encode('utf-8')
    
    # Generate HMAC-SHA256 hash
    signature = hmac.new(key, msg, hashlib.sha256).hexdigest()
    
    # Return a 10-character prefix with the internal domain
    return f"{signature[:10]}@chitchat.internal"
