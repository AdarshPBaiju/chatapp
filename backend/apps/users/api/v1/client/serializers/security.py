from rest_framework import serializers

class TwoFactorVerifySerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Code must be numeric.")
        return value

class TwoFactorRecoverySerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
