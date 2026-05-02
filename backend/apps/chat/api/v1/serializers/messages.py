from rest_framework import serializers
from chat.models import Message
from chat.services import ChatService
from users.models import Client


class ChatMemberSerializer(serializers.ModelSerializer):
    id = serializers.ReadOnlyField(source="user.id")
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ["id", "full_name", "avatar", "username"]

    def get_avatar(self, obj):
        request = self.context.get("request")
        room = self.context.get("room")
        viewer_client = (
            request.user.client
            if request and request.user.is_authenticated
            else None
        )

        if room and viewer_client and room.type == room.RoomType.DIRECT:
            if obj.id != viewer_client.id:
                context = ChatService.get_display_context(room, viewer_client)
                return context.get("avatar")

        if not obj.profile_picture:
            return None

        url = obj.profile_picture.url
        return request.build_absolute_uri(url) if request else url


class MessageSerializer(serializers.ModelSerializer):
    sender = ChatMemberSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "sequence_id",
            "sender",
            "content",
            "type",
            "metadata",
            "created_at",
        ]
