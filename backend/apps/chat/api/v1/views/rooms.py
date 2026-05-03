from rest_framework import generics, permissions
from django.db.models import OuterRef, Subquery, IntegerField
from chat.models import Room, RoomMembership
from ..serializers.rooms import RoomSerializer
import redis
from django.conf import settings
from urllib.parse import urlparse


class RoomListAPIView(generics.ListAPIView):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        queryset = self.get_queryset()

        all_user_ids = set()
        for room in queryset:
            if hasattr(room, "memberships"):
                for m in room.memberships.all():
                    if m.is_active:
                        all_user_ids.add(str(m.client.user_id).lower())

        presence_map = {}
        if all_user_ids:
            try:
                redis_url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
                parsed = urlparse(redis_url)
                presence_redis_url = f"{parsed.scheme}://{parsed.netloc}/0"

                r = redis.from_url(presence_redis_url)
                pipe = r.pipeline()

                user_list = list(all_user_ids)
                for uid in user_list:
                    pipe.scard(f"user:sessions:{uid}")

                results = pipe.execute()
                for i, count in enumerate(results):
                    presence_map[user_list[i]] = "online" if count > 0 else "offline"
            except Exception as e:
                print(f"Presence Fetch Error: {e}")

        context["presence_map"] = presence_map
        return context

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
            .select_related("last_message", "last_message__sender")
            .prefetch_related("memberships__client", "memberships__client__user")
            .annotate(
                annotated_unread_count=Subquery(
                    unread_subquery, output_field=IntegerField()
                )
            )
            .order_by("-updated_at")
        )
