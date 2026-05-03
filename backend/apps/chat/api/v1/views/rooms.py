from rest_framework import generics, permissions
from django.db.models import OuterRef, Subquery, IntegerField
from chat.models import Room, RoomMembership
from ..serializers.rooms import RoomSerializer


class RoomListAPIView(generics.ListAPIView):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        client = self.request.user.client

        unread_subquery = RoomMembership.objects.filter(
            room=OuterRef("pk"), client=client
        ).values("unread_count")[:1]

        return (
            Room.objects.filter(
                memberships__client=client,
                memberships__is_active=True,
                is_deleted=False,
            )
            .annotate(
                annotated_unread_count=Subquery(
                    unread_subquery, output_field=IntegerField()
                )
            )
            .order_by("-updated_at")
        )
