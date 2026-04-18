from __future__ import annotations

from rest_framework import serializers

class IdentityInitSerializer(serializers.Serializer):
    """
    Validation for the initial identity discovery phase.
    """
    email = serializers.EmailField(required=True)

class IdentityChallengeSerializer(serializers.Serializer):
    """
    Validation for the credential submission phases.
    Encapsulates the HIT (Hardened Identity Token) and the selected verification method.
    """
    METHOD_CHOICES = [
        ("password", "Password"),
        ("email_otp", "Email OTP"),
        ("totp", "Authenticator App"),
        ("backup_code", "Backup Recovery"),
    ]

    hit = serializers.CharField(required=True)
    method = serializers.ChoiceField(choices=METHOD_CHOICES, required=True)
    expected_step = serializers.IntegerField(required=True)
    
    # Credential payloads (Conditional based on method)
    password = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, max_length=6, min_length=6)

    def validate(self, attrs):
        method = attrs.get("method")
        
        if method == "password" and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required for this method."})
            
        if method in ["email_otp", "totp"] and not attrs.get("code"):
            # Note: For email_otp, code might be missing on the first 'init' call 
            # to trigger the send, which the view handles.
            pass
            
        return attrs
