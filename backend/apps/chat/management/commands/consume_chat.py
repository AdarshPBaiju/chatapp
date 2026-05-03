import json
import time
import logging
from functools import lru_cache
from django.db import models, transaction
from django.core.management.base import BaseCommand
from django.conf import settings
from confluent_kafka import Consumer, KafkaError
from chat.models import Room, Message, MessageReceipt, RoomMembership
from users.models import Client
from core.kafka import KafkaProducer

logger = logging.getLogger(__name__)


# High-Performance Caching Layer
@lru_cache(maxsize=1024)
def get_cached_room(room_id):
    return Room.objects.filter(id=room_id).first()


@lru_cache(maxsize=4096)
def get_cached_membership(room_id, client_id):
    return RoomMembership.objects.filter(
        room_id=room_id, client_id=client_id, is_active=True
    ).first()


class Command(BaseCommand):
    help = "Consumes chat messages from Kafka and persists them to the database"

    def handle(self, *args, **options):
        consumer_config = settings.KAFKA_CONSUMER_CONFIG.copy()
        consumer_config["group.id"] = "chat-worker"
        consumer_config["auto.offset.reset"] = "earliest"

        consumer = Consumer(consumer_config)
        consumer.subscribe(["chat.inbound", "chat.receipts"])

        logger.info("🚀 Chat Worker started, listening for messages...")

        import signal

        self.running = True

        def handle_shutdown(signum, frame):
            logger.info("Graceful shutdown initiated...")
            self.running = False

        signal.signal(signal.SIGTERM, handle_shutdown)
        signal.signal(signal.SIGINT, handle_shutdown)

        try:
            while self.running:
                msg = consumer.poll(1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    elif msg.error().code() == KafkaError.UNKNOWN_TOPIC_OR_PART:
                        logger.warning(f"⚠️ Topic not ready: {msg.error()}")
                        time.sleep(2)
                        continue
                    else:
                        logger.error(f"❌ Kafka error: {msg.error()}")
                        break

                topic = msg.topic()
                data = json.loads(msg.value().decode("utf-8"))

                event_type = data.get("Type", data.get("type"))
                payload = data.get("Payload", data.get("payload", data))

                if topic == "chat.inbound":
                    if event_type == "CHAT_MESSAGE":
                        self.process_chat_message(payload)
                    elif event_type == "READ_RECEIPT":
                        self.process_read_receipt(payload)
                elif topic == "chat.receipts":
                    if event_type == "DELIVERY_RECEIPT":
                        self.process_delivery_receipt(payload)

        except KeyboardInterrupt:
            pass
        finally:
            logger.info("Closing consumer...")
            consumer.close()

    @transaction.atomic
    def process_chat_message(self, data):
        logger.info(f"Processing message: {data}")
        room_id = data.get("room_id")
        user_id = data.get("user_id")
        content = data.get("content")
        sequence_id = data.get("sequence_id")
        temp_id = data.get("temp_id")
        idempotency_key = data.get("idempotency_key")

        client = Client.objects.filter(user_id=user_id).first()
        if not client:
            logger.error(f"❌ Client {user_id} not found")
            return

        room = None
        if room_id:
            room = get_cached_room(room_id)
        elif data.get("target_user_id"):
            # Lazy creation: find or create a direct room
            target_user_id = data.get("target_user_id")
            from chat.services import ChatService
            target_client = Client.objects.filter(user_id=target_user_id).first()
            if target_client:
                room = ChatService.get_or_create_direct_room(client, target_client)
                room_id = str(room.id)

        if not room:
            logger.error(f"❌ Room {room_id} not found and no target_user_id provided")
            return

        # 🚀 SECURITY: Ensure sender is an active member
        sender_membership = get_cached_membership(room_id, client.id)
        if not sender_membership:
            logger.error(f"❌ Security violation: {user_id} is not in room {room_id}")
            return

        # Idempotency check
        if (
            idempotency_key
            and Message.objects.filter(idempotency_key=idempotency_key).exists()
        ):
            logger.warning(f"⚠️ Duplicate message ignored: {idempotency_key}")
            return

        try:
            # 1. Save the Message
            message = Message.objects.create(
                id=data.get("id"),
                room=room,
                sender=client,
                content=content,
                sequence_id=sequence_id,
                idempotency_key=idempotency_key,
                type="TEXT",
                metadata={"temp_id": data.get("temp_id")},
                sent_at=data.get("sent_at") or int(time.time() * 1000),
            )

            room.last_message = message
            room.updated_at = message.created_at
            room.save(update_fields=["last_message", "updated_at"])

            memberships = RoomMembership.objects.filter(
                room=room, is_active=True
            ).select_related("client", "client__user")

            receipts = []

            for membership in memberships:
                is_sender = membership.client_id == client.id

                status = "READ" if is_sender else "SENT"
                receipts.append(
                    MessageReceipt(
                        message=message,
                        client=membership.client,
                        status=status,
                        read_at=message.created_at if is_sender else None,
                    )
                )

                if not is_sender:
                    # Optimized unread count update: Only for recipients
                    RoomMembership.objects.filter(id=membership.id).update(
                        unread_count=models.F("unread_count") + 1
                    )

                    # BROADCAST: Notify recipient via Go Hub (High-Performance Singleton)
                    delivery_event = {
                        "type": "CHAT_DELIVERY",
                        "payload": {
                            "id": str(message.id),
                            "room_id": str(room_id),
                            "sequence_id": sequence_id,
                            "sender_id": str(user_id),
                            "content": content,
                            "temp_id": temp_id,
                            "created_at": message.created_at.isoformat(),
                            "status": "sent",
                        },
                    }
                    KafkaProducer.produce(
                        "chat.delivery",
                        key=str(membership.client.user.id),
                        value=json.dumps(delivery_event).encode("utf-8"),
                    )

            # Bulk save receipts for 10x performance
            MessageReceipt.objects.bulk_create(receipts)
            KafkaProducer.flush()

            logger.info(f"✅ Message {message.id} persisted and broadcasted")

            logger.info(f"✅ Message {message.id} persisted and broadcasted")

        except Exception as e:
            logger.error(f"❌ Failed to process message: {e}")

    @transaction.atomic
    def process_read_receipt(self, data):
        room_id = data.get("room_id")
        user_id = data.get("user_id")
        sequence_id = data.get("sequence_id")

        room = get_cached_room(room_id)
        client = Client.objects.filter(user_id=user_id).first()
        if not room or not client:
            return

        try:
            # 1. Update all messages up to this sequence as READ
            unread_receipts = MessageReceipt.objects.filter(
                client=client, message__room=room, message__sequence_id__lte=sequence_id
            ).exclude(status="READ")

            if unread_receipts.exists():
                unread_receipts.update(status="READ", read_at=models.functions.Now())

                # 2. Reset unread count
                RoomMembership.objects.filter(room=room, client=client).update(
                    unread_count=0
                )

                # 3. Broadcast status update to all members via Singleton
                status_event = {
                    "type": "CHAT_STATUS",
                    "payload": {
                        "room_id": str(room_id),
                        "last_read_seq": sequence_id,
                    },
                }

                memberships = RoomMembership.objects.filter(
                    room=room, is_active=True
                ).select_related("client", "client__user")
                for member in memberships:
                    if member.client.id != client.id:
                        target_user_id = str(member.client.user.id)
                        KafkaProducer.produce(
                            "chat.delivery",
                            key=target_user_id,
                            value=json.dumps(status_event).encode("utf-8"),
                        )
                KafkaProducer.flush()
                logger.info(
                    f"👁️ Room {room_id} marked as read by {user_id} up to {sequence_id}"
                )

        except Exception as e:
            logger.error(f"❌ Failed to process read receipt: {e}")
    @transaction.atomic
    def process_delivery_receipt(self, data):
        logger.info(f"Processing delivery receipt: {data}")
        message_id = data.get("message_id")
        user_id = data.get("user_id")

        if not message_id or not user_id:
            return

        # Update the specific receipt for this user
        receipt = MessageReceipt.objects.filter(
            message_id=message_id,
            client__user_id=user_id,
            status="SENT" # Only update if it hasn't been upgraded to DELIVERED or READ already
        ).first()

        if receipt:
            receipt.status = "DELIVERED"
            receipt.save()
            logger.info(f"✅ Message {message_id} marked as DELIVERED for user {user_id}")
        else:
            logger.warning(f"⚠️ No SENT receipt found for message {message_id} and user {user_id}")
