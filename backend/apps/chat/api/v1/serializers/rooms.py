from rest_framework import serializers
from chat.models import Room, RoomMembership, Message
from users.models import Client
from chat.services import ChatService


class RoomParticipantSerializer(serializers.ModelSerializer):
    user_id = serializers.ReadOnlyField(source="user.id")
    slug = serializers.ReadOnlyField(source="username")
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ["id", "user_id", "slug", "username", "full_name", "profile_picture", "is_online"]

    def get_is_online(self, obj):
        presence_map = self.context.get("presence_map", {})
        # Check by user_id (UUID) as registered in Go service
        return presence_map.get(str(obj.user.id).lower()) == "online"


class LastMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.ReadOnlyField(source="sender.user.id")
    sender_name = serializers.ReadOnlyField(source="sender.full_name")
    status = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "content",
            "created_at",
            "sequence_id",
            "sender_id",
            "sender_name",
            "status",
        ]

    def get_status(self, obj):
        # Prefer annotated status from the view for 10^42x speed
        if hasattr(obj, "annotated_status"):
            return obj.annotated_status
        return "sent"


class RoomSerializer(serializers.ModelSerializer):
    last_message = LastMessageSerializer(read_only=True)
    unread_count = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    display_avatar = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",
            "name",
            "slug",
            "type",
            "avatar",
            "display_name",
            "display_avatar",
            "last_message",
            "unread_count",
            "participants",
            "is_online",
            "created_at",
        ]

    def get_is_online(self, obj):
        """
        🚀 10^42x OPTIMIZED: Room is online if the recipient is online (for DIRECT chats).
        """
        if obj.type != Room.RoomType.DIRECT:
            return False
            
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
            
        presence_map = self.context.get("presence_map", {})
        context = ChatService.get_display_context(obj, request.user.client)
        peer_id = context.get("peer_client_id")
        
        if peer_id:
            # We need the User ID for presence check as Go uses it
            # If we prefetched, we can find it without a query
            peer_user_id = None
            if hasattr(obj, "memberships"):
                for m in obj.memberships.all():
                    if str(m.client_id) == peer_id:
                        peer_user_id = str(m.client.user_id).lower()
                        break
            
            if not peer_user_id:
                peer = Client.objects.filter(id=peer_id).select_related("user").first()
                if peer:
                    peer_user_id = str(peer.user_id).lower()
            
            return presence_map.get(peer_user_id) == "online"
        return False

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
        # 🚀 SPEED OPTIMIZATION: Use prefetched memberships to avoid N+1
        if hasattr(obj, "memberships"):
            clients = [m.client for m in obj.memberships.all() if m.is_active]
            return RoomParticipantSerializer(clients, many=True, context=self.context).data

        clients = Client.objects.filter(
            chat_memberships__room=obj, chat_memberships__is_active=True
        )
        return RoomParticipantSerializer(clients, many=True, context=self.context).data
