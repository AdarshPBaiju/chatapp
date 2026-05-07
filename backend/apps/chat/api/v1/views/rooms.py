from rest_framework import generics, permissions
from django.db.models import OuterRef, Subquery, IntegerField
from chat.models import Room, RoomMembership
from ..serializers.rooms import RoomSerializer
import json
from django_redis import get_redis_connection


class RoomListAPIView(generics.ListAPIView):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        client = request.user.client
        cache_key = f"room_list:client:{client.id}"

        try:
            r = get_redis_connection("default")
            cached_data = r.get(cache_key)
            if cached_data:
                # Return cached JSON directly
                data = json.loads(cached_data)

                presence_map = self._get_presence_map(data)
                return generics.Response(
                    {"results": data, "presence_map": presence_map, "from_cache": True}
                )
        except Exception as e:
            print(f"Cache Fetch Error: {e}")

        # Cache Miss: Fetch from DB
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data

        # Inject Presence
        presence_map = self._get_presence_map(data)

        # Cache the results for 1 hour
        try:
            r = get_redis_connection("default")
            r.set(cache_key, json.dumps(data), ex=3600)
        except Exception as e:
            print(f"Cache Store Error: {e}")

        return generics.Response(
            {"results": data, "presence_map": presence_map, "from_cache": False}
        )

    def _get_presence_map(self, room_data):
        all_user_ids = set()
        for room in room_data:
            participants = room.get("participants", [])
            for p in participants:
                uid = p.get("user_id")
                if uid:
                    all_user_ids.add(str(uid).lower())

        presence_map = {}
        if all_user_ids:
            try:
                r = get_redis_connection("default")
                pipe = r.pipeline()
                user_list = list(all_user_ids)
                for uid in user_list:
                    pipe.scard(f"user:sessions:{uid}")

                results = pipe.execute()
                for i, count in enumerate(results):
                    presence_map[user_list[i]] = "online" if count > 0 else "offline"
            except Exception:
                pass
        return presence_map

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
