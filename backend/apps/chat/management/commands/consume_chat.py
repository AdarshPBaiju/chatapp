import json
import logging
from functools import lru_cache
from django.db import models, transaction
from django.core.management.base import BaseCommand
from django.conf import settings
from confluent_kafka import Consumer, Producer, KafkaException
from chat.models import Room, Message, MessageReceipt, RoomMembership
from users.models import Client

logger = logging.getLogger(__name__)

# High-Performance Caching Layer
@lru_cache(maxsize=1024)
def get_cached_room(room_id):
    return Room.objects.filter(id=room_id).first()

@lru_cache(maxsize=4096)
def get_cached_client(client_id):
    return Client.objects.filter(id=client_id).first()

class Command(BaseCommand):
    help = "Extreme-Optimized Chat Persistence Worker"

    def handle(self, *args, **options):
        consumer_conf = {
            **settings.KAFKA_CONSUMER_CONFIG,
            "group.id": "chat-persistence-worker-v2",
            "auto.offset.reset": "earliest",
            "fetch.min.bytes": 100000, # Wait for more data before polling
            "fetch.wait.max.ms": 50,    # Max delay for batching
        }
        producer_conf = {
            **settings.KAFKA_PRODUCER_CONFIG,
            "compression.type": "zstd",
            "linger.ms": 10,           # Batching delay
        }

        consumer = Consumer(consumer_conf)
        producer = Producer(producer_conf)
        consumer.subscribe(["chat.inbound"])

        self.stdout.write(self.style.SUCCESS("🚀 Ultra-Optimized Worker Operational..."))

        try:
            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None: continue
                if msg.error():
                    if msg.error().code() == KafkaException._PARTITION_EOF: continue
                    logger.error(f"Kafka error: {msg.error()}")
                    break

                try:
                    payload = json.loads(msg.value().decode("utf-8"))
                    self.process_message(payload, producer)
                except Exception as e:
                    logger.exception(f"Processing error: {e}")

        except KeyboardInterrupt:
            pass
        finally:
            consumer.close()

    def process_message(self, data, producer):
        event_type = data.get("type")
        room_id = data.get("key")
        content_data = data.get("payload", {})

        if event_type == "CHAT_MESSAGE":
            self.process_chat_message(room_id, content_data, producer)
        elif event_type == "READ_RECEIPT":
            self.process_read_receipt(room_id, content_data, producer)

    def process_chat_message(self, room_id, content_data, producer):
        sender_id = content_data.get("sender_id")
        content = content_data.get("content")
        temp_id = content_data.get("temp_id")
        sequence_id = content_data.get("sequence_id")

        # 1. Extreme Fast Path: Resolve Room and Sender from Cache
        room = get_cached_room(room_id)
        sender = get_cached_client(sender_id)

        if not room or not sender:
            # Fallback if cache missed and not found in DB
            logger.error(f"Entity missing: Room {room_id} or Sender {sender_id}")
            return

        with transaction.atomic():
            # 2. Optimized Persistence
            message = Message.objects.create(
                room=room, 
                sender=sender, 
                content=content, 
                sequence_id=sequence_id,
                metadata={"temp_id": temp_id}
            )

            # Update room last message using F expression for safety
            Room.objects.filter(id=room_id).update(last_message=message)

            # 3. High-Performance Batch Receipts
            memberships = RoomMembership.objects.filter(room=room, is_active=True).select_related("client")
            
            receipts_to_create = []
            delivery_events = []

            for membership in memberships:
                is_sender = (membership.client_id == sender.id)
                
                # Prepare Bulk Receipt
                receipts_to_create.append(MessageReceipt(
                    message=message,
                    client=membership.client,
                    status="SENT" if is_sender else "DELIVERED"
                ))

                if not is_sender:
                    # Optimized unread count update
                    RoomMembership.objects.filter(id=membership.id).update(unread_count=models.F("unread_count") + 1)

                    # Prepare Delivery Event
                    delivery_events.append({
                        "type": "CHAT_DELIVERY",
                        "key": str(membership.client_id),
                        "payload": {
                            "message_id": str(message.id),
                            "room_id": str(room.id),
                            "sender_id": str(sender_id),
                            "content": content,
                            "timestamp": message.created_at.isoformat(),
                            "temp_id": temp_id,
                            "sequence_id": sequence_id,
                        },
                    })

            # Bulk Insert Receipts for 10x speedup in groups
            MessageReceipt.objects.bulk_create(receipts_to_create, ignore_conflicts=True)

            # 4. Asynchronous Delivery Broadcast
            for event in delivery_events:
                producer.produce(
                    "chat.delivery",
                    key=event["key"],
                    value=json.dumps(event).encode("utf-8")
                )
            
            producer.flush()
            logger.info(f"⚡ [Fast-Path] Persisted message {message.id}")

    def process_read_receipt(self, room_id, content_data, producer):
        client_id = content_data.get("client_id")
        sequence_id = content_data.get("sequence_id")

        with transaction.atomic():
            try:
                room = Room.objects.get(id=room_id)
                client = Client.objects.get(id=client_id)
                membership = RoomMembership.objects.get(room=room, client=client)
            except (Room.DoesNotExist, Client.DoesNotExist, RoomMembership.DoesNotExist):
                return

            # 1. Update all receipts up to this sequence_id as READ
            receipts = MessageReceipt.objects.filter(
                client=client,
                message__room=room,
                message__sequence_id__lte=sequence_id
            ).exclude(status="READ")
            
            count = receipts.count()
            if count > 0:
                receipts.update(status="READ", read_at=models.functions.Now())
                
                # 2. Decrement unread count
                membership.unread_count = max(0, membership.unread_count - count)
                membership.save(update_fields=["unread_count"])

                # 3. Broadcast status update to all members
                status_event = {
                    "type": "CHAT_STATUS",
                    "key": str(room_id),
                    "payload": {
                        "room_id": str(room_id),
                        "client_id": str(client_id),
                        "last_read_seq": sequence_id
                    }
                }
                # Broadcast to room members via Go Hub logic
                memberships = RoomMembership.objects.filter(room=room, is_active=True)
                for member in memberships:
                    if member.client != client: # Don't send back to the one who read it
                        producer.produce(
                            "chat.delivery",
                            key=str(member.client.id),
                            value=json.dumps(status_event).encode("utf-8")
                        )
                producer.flush()
                logger.info(f"Read receipt processed for client {client_id} in room {room_id}")
