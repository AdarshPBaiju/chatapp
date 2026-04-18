from rest_framework import serializers
from users.models import Client, CustomUser

class ClientProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    user_id = serializers.UUIDField(source='user.id', read_only=True)

    class Meta:
        model = Client
        fields = [
            'user_id',
            'email',
            'full_name',
            'bio',
            'profile_picture',
            'gender',
            'phone_number',
            'is_two_factor_enabled',
        ]
        read_only_fields = ['is_two_factor_enabled']

    def update(self, instance, validated_data):
        # Handle profile picture deletion if needed (logic can be expanded here)
        return super().update(instance, validated_data)
