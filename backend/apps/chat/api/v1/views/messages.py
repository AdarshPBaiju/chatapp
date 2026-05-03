from rest_framework import generics, permissions
from chat.models import Message, RoomMembership, MessageReceipt
from ..serializers.messages import MessageSerializer
from django.shortcuts import get_object_or_404
from django.db.models import Exists, OuterRef, Value, Case, When, CharField
from django.db import models
import json
from core.kafka import KafkaProducer


class MessageHistoryAPIView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        room_id = self.kwargs.get("room_id")
        client = self.request.user.client

        membership = get_object_or_404(
            RoomMembership, room_id=room_id, client=client, is_active=True
        )
        context["room"] = membership.room
        return context

    def get_queryset(self):
        room_id = self.kwargs.get("room_id")
        client = self.request.user.client

        # Security: Ensure user is a member of the room
        membership = get_object_or_404(
            RoomMembership, room_id=room_id, client=client, is_active=True
        )

        # 🚀 ULTRA-OPTIMIZED: Calculate status directly in the database using Exists/Subqueries
        read_exists = MessageReceipt.objects.filter(
            message=OuterRef("pk"), status="READ"
        ).exclude(client_id=OuterRef("sender_id"))

        delivered_exists = MessageReceipt.objects.filter(
            message=OuterRef("pk"), status="DELIVERED"
        ).exclude(client_id=OuterRef("sender_id"))

        # Viewer-specific receipt status
        viewer_receipt = MessageReceipt.objects.filter(
            message=OuterRef("pk"), client=client
        ).values("status")[:1]

        queryset = Message.objects.filter(room_id=room_id, is_deleted=False).annotate(
            annotated_status=Case(
                When(Exists(read_exists), then=Value("read")),
                When(Exists(delivered_exists), then=Value("delivered")),
                default=Value("sent"),
                output_field=CharField(),
            ),
            viewer_status=models.Subquery(viewer_receipt, output_field=CharField()),
        )

        unread_receipts = MessageReceipt.objects.filter(
            client=client, message__room_id=room_id
        ).exclude(status="READ")

        membership.unread_count = 0
        membership.save(update_fields=["unread_count"])

        if unread_receipts.exists():
            latest_msg = queryset.order_by("-sequence_id").first()
            max_seq = latest_msg.sequence_id if latest_msg else 0

            unread_receipts.update(status="READ", read_at=models.functions.Now())

            status_event = {
                "type": "CHAT_STATUS",
                "payload": {
                    "room_id": str(room_id),
                    "last_read_seq": max_seq,
                },
            }

            other_members = (
                RoomMembership.objects.filter(room_id=room_id, is_active=True)
                .exclude(client=client)
                .select_related("client", "client__user")
            )
            for member in other_members:
                target_user_id = str(member.client.user.id)
                KafkaProducer.produce(
                    "chat.delivery",
                    key=target_user_id,
                    value=json.dumps(status_event).encode("utf-8"),
                )
            KafkaProducer.flush()

        last_seen_seq_id = self.request.query_params.get("last_seen_seq_id")
        before_seq_id = self.request.query_params.get("before_seq_id")

        if last_seen_seq_id:
            queryset = queryset.filter(sequence_id__gt=int(last_seen_seq_id)).order_by(
                "sequence_id"
            )
        elif before_seq_id:
            queryset = queryset.filter(sequence_id__lt=int(before_seq_id)).order_by(
                "-sequence_id"
            )[:50]
        else:
            queryset = queryset.order_by("-sequence_id")[:20]

        return queryset
