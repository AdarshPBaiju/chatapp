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
            request.user.client if request and request.user.is_authenticated else None
        )

        if room and viewer_client and room.type == room.RoomType.DIRECT:
            if obj.id != viewer_client.id:
                context = ChatService.get_display_context(room, viewer_client)
                return context.get("avatar")

        if not obj.profile_picture:
            return None

        url = obj.profile_picture.url
        return request.build_absolute_uri(url) if request else url


class MessageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        from chat.models import MessageAttachment
        model = MessageAttachment
        fields = [
            "id",
            "type",
            "storage_key",
            "file_name",
            "mime_type",
            "size_bytes",
            "metadata",
            "is_processed",
        ]


class SimpleMessageSerializer(serializers.ModelSerializer):
    """Simplified version for nested replies"""
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "content", "type", "sender_name", "sequence_id"]


class MessageSerializer(serializers.ModelSerializer):
    sender = ChatMemberSerializer(read_only=True)
    status = serializers.SerializerMethodField()

    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    reply_to = SimpleMessageSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "room_id",
            "sequence_id",
            "sender",
            "content",
            "type",
            "metadata",
            "status",
            "sent_at",
            "reply_to",
            "forwarded_from",
            "is_edited",
            "edited_at",
            "delivered_at",
            "seen_at",
            "attachments",
        ]

    sent_at = serializers.SerializerMethodField()

    def get_sent_at(self, obj):
        if obj.sent_at:
            return obj.sent_at
        return int(obj.created_at.timestamp() * 1000)

    def get_status(self, obj):
        request = self.context.get("request")
        viewer_id = (
            request.user.client.id
            if request and hasattr(request.user, "client")
            else None
        )

        if obj.sender_id == viewer_id:
            if hasattr(obj, "annotated_status"):
                return obj.annotated_status

            receipts = obj.receipts.exclude(client_id=obj.sender_id)
            if not receipts.exists():
                return "sent"

            if any(r.status == "READ" for r in receipts):
                return "read"
            if all(r.status == "DELIVERED" for r in receipts):
                return "delivered"
            return "sent"

        receipt = obj.receipts.filter(client_id=viewer_id).first()
        return receipt.status.lower() if receipt else "sent"
