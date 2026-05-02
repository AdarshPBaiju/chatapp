from rest_framework import serializers
from chat.models import Room, RoomMembership, Message
from users.models import Client

class RoomParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "username", "full_name", "avatar"]

class LastMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "content", "created_at", "sequence_id"]

class RoomSerializer(serializers.ModelSerializer):
    last_message = LastMessageSerializer(read_only=True)
    unread_count = serializers.SerializerMethodField()
    participants = RoomParticipantSerializer(many=True, read_only=True)

    class Meta:
        model = Room
        fields = [
            "id", 
            "name", 
            "room_type", 
            "avatar", 
            "last_message", 
            "unread_count", 
            "participants",
            "created_at"
        ]

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                membership = RoomMembership.objects.get(room=obj, client=request.user.client)
                return membership.unread_count
            except RoomMembership.DoesNotExist:
                return 0
        return 0
