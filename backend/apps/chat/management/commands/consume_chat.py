import json
import logging
from django.db import models
from django.core.management.base import BaseCommand
from django.conf import settings
from confluent_kafka import Consumer, Producer, KafkaException
from apps.chat.models import Room, Message, MessageReceipt, RoomMembership
from users.models import Client
from django.db import transaction

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Consumes chat messages from Kafka and persists them to the database."

    def handle(self, *args, **options):
        consumer_conf = {
            **settings.KAFKA_CONSUMER_CONFIG,
            "group.id": "chat-persistence-worker",
            "auto.offset.reset": "earliest",
        }
        producer_conf = settings.KAFKA_PRODUCER_CONFIG

        consumer = Consumer(consumer_conf)
        producer = Producer(producer_conf)

        consumer.subscribe(["chat.inbound"])

        self.stdout.write(
            self.style.SUCCESS(
                "Chat Persistence Worker started. Listening to 'chat.inbound'..."
            )
        )

        try:
            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaException._PARTITION_EOF:
                        continue
                    else:
                        logger.error(f"Kafka error: {msg.error()}")
                        break

                try:
                    payload = json.loads(msg.value().decode("utf-8"))
                    self.process_message(payload, producer)
                except Exception as e:
                    logger.exception(f"Error processing message: {e}")

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

        with transaction.atomic():
            # 1. Resolve Room and Sender
            try:
                room = Room.objects.get(id=room_id)
                sender = Client.objects.get(id=sender_id)
            except (Room.DoesNotExist, Client.DoesNotExist):
                logger.error(f"Room {room_id} or Sender {sender_id} not found.")
                return

            # 2. Persist Message
            message = Message.objects.create(
                room=room, 
                sender=sender, 
                content=content, 
                sequence_id=sequence_id,
                metadata={"temp_id": temp_id}
            )

            # 3. Update Room (Optimization)
            room.last_message = message
            room.save(update_fields=["last_message"])

            memberships = RoomMembership.objects.filter(room=room, is_active=True)

            for membership in memberships:
                # Create receipt record
                MessageReceipt.objects.get_or_create(
                    message=message,
                    client=membership.client,
                    defaults={
                        "status": "SENT" if membership.client == sender else "DELIVERED"
                    },
                )

                # 4. Handle Unread Counts and Delivery
                if membership.client != sender:
                    # Increment unread count for recipients
                    membership.unread_count += 1
                    membership.save(update_fields=["unread_count"])

                    delivery_event = {
                        "type": "CHAT_DELIVERY",
                        "key": str(membership.client.id),  # Target UserID for Go Hub
                        "payload": {
                            "message_id": str(message.id),
                            "room_id": str(room.id),
                            "sender_id": str(sender.id),
                            "content": content,
                            "timestamp": message.created_at.isoformat(),
                            "temp_id": temp_id,
                            "sequence_id": sequence_id,
                        },
                    }
                    producer.produce(
                        "chat.delivery",
                        key=str(membership.client.id),
                        value=json.dumps(delivery_event).encode("utf-8"),
                    )

            producer.flush()
            logger.info(f"Persisted message {message.id} for room {room.id}")

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
