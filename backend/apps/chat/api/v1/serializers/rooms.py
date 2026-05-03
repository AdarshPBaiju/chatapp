from rest_framework import serializers
from chat.models import Room, RoomMembership, Message
from users.models import Client
from chat.services import ChatService


class RoomParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "username", "full_name", "profile_picture"]


class LastMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.ReadOnlyField(source="sender.user.id")
    sender_name = serializers.ReadOnlyField(source="sender.full_name")

    class Meta:
        model = Message
        fields = [
            "id",
            "content",
            "created_at",
            "sequence_id",
            "sender_id",
            "sender_name",
        ]


class RoomSerializer(serializers.ModelSerializer):
    last_message = LastMessageSerializer(read_only=True)
    unread_count = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    display_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",
            "name",
            "type",
            "avatar",
            "display_name",
            "display_avatar",
            "last_message",
            "unread_count",
            "participants",
            "created_at",
        ]

    def get_display_name(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return obj.name
        context = ChatService.get_display_context(obj, request.user.client)
        return context["name"]

    def get_display_avatar(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        context = ChatService.get_display_context(obj, request.user.client)
        return context["avatar"]

    def get_unread_count(self, obj):
        # Prefer the annotated count from the view for performance
        if hasattr(obj, "annotated_unread_count"):
            return obj.annotated_unread_count
            
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                membership = RoomMembership.objects.get(
                    room=obj, client=request.user.client
                )
                return membership.unread_count
            except RoomMembership.DoesNotExist:
                return 0
        return 0

    def get_participants(self, obj):
        clients = Client.objects.filter(
            chat_memberships__room=obj, chat_memberships__is_active=True
        )
        return RoomParticipantSerializer(clients, many=True).data
