from rest_framework import generics, permissions
from chat.models import Room
from ..serializers.rooms import RoomSerializer


class RoomListAPIView(generics.ListAPIView):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        client = self.request.user.client
        return Room.objects.filter(
            memberships__client=client, memberships__is_active=True, is_deleted=False
        ).order_by("-updated_at")
