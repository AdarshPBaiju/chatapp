from rest_framework import generics, permissions
from apps.chat.models import Message, RoomMembership
from ..serializers.messages import MessageSerializer
from django.shortcuts import get_object_or_404

class MessageHistoryAPIView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        room_id = self.kwargs.get("room_id")
        client = self.request.user.client
        
        # Security: Ensure user is a member of the room
        get_object_or_404(RoomMembership, room_id=room_id, client=client, is_active=True)
        
        return Message.objects.filter(room_id=room_id, is_deleted=False).order_by("-sequence_id")
