from django.db import models
from core.models.base import TimestampedModel, SoftDeleteModel
from users.models import Client
from core.utils import SmartUploadPath, UploadPathConfig

class Room(SoftDeleteModel):
    class RoomType(models.TextChoices):
        DIRECT = "DIRECT", "Direct"
        GROUP = "GROUP", "Group"

    name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    avatar = models.ImageField(
        upload_to=SmartUploadPath(
            UploadPathConfig(
                base_path="room_avatars",
                field_lookup="id",
                filename_mode="prepend_uuid",
            )
        ),
        blank=True,
        null=True
    )
    banner = models.ImageField(
        upload_to=SmartUploadPath(
            UploadPathConfig(
                base_path="room_banners",
                field_lookup="id",
                filename_mode="prepend_uuid",
            )
        ),
        blank=True,
        null=True
    )
    type = models.CharField(
        max_length=10, choices=RoomType.choices, default=RoomType.DIRECT
    )
    
    last_message = models.ForeignKey(
        "Message", 
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL,
        related_name="last_in_room"
    )

    class Meta:
        db_table = "chat_rooms"
        verbose_name = "Chat Room"
        verbose_name_plural = "Chat Rooms"

class RoomMembership(SoftDeleteModel): # ERP-Scale: preserve history of who left
    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        ADMIN = "ADMIN", "Admin"
        MEMBER = "MEMBER", "Member"

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="memberships")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="chat_memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    is_active = models.BooleanField(default=True)
    
    # PERFORMANCE: Denormalized unread count for rapid UI rendering
    unread_count = models.IntegerField(default=0)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_room_memberships"
        unique_together = ("room", "client")
        indexes = [
            models.Index(fields=["client", "is_active", "unread_count"]),
        ]

class RoomRoleLog(TimestampedModel):
    membership = models.ForeignKey(
        RoomMembership, on_delete=models.CASCADE, related_name="role_logs"
    )
    old_role = models.CharField(max_length=10, choices=RoomMembership.Role.choices)
    new_role = models.CharField(max_length=10, choices=RoomMembership.Role.choices)
    changed_by = models.ForeignKey(
        Client, on_delete=models.SET_NULL, null=True, related_name="role_changes_performed"
    )
    reason = models.TextField(blank=True)

    class Meta:
        db_table = "chat_room_role_logs"
        ordering = ["-created_at"]

class Message(SoftDeleteModel):
    class MessageStatus(models.TextChoices):
        SENT = "SENT", "Sent"
        DELIVERED = "DELIVERED", "Delivered"
        READ = "READ", "Read"

    class MessageType(models.TextChoices):
        TEXT = "TEXT", "Text"
        IMAGE = "IMAGE", "Image"
        FILE = "FILE", "File"
        SYSTEM = "SYSTEM", "System"

    room = models.ForeignKey(
        Room,
        related_name="messages",
        on_delete=models.CASCADE
    )
    sequence_id = models.BigIntegerField(db_index=True) # Monotonic sequencing per room
    sender = models.ForeignKey(
        Client,
        related_name="sent_messages",
        on_delete=models.CASCADE
    )
    type = models.CharField(
        max_length=10, 
        choices=MessageType.choices, 
        default=MessageType.TEXT
    )
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "chat_messages"
        verbose_name = "Message"
        verbose_name_plural = "Messages"
        indexes = [
            models.Index(fields=["room", "-created_at"]),
            models.Index(fields=["sender"]),
        ]
        ordering = ["-created_at", "-id"]

class MessageReceipt(TimestampedModel):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="receipts")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="message_receipts")
    status = models.CharField(
        max_length=10, 
        choices=Message.MessageStatus.choices,
        default=Message.MessageStatus.DELIVERED
    )
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chat_message_receipts"
        unique_together = ("message", "client")
        # PERFORMANCE: Advanced indexes for high-frequency unread/delivery queries
        indexes = [
            models.Index(fields=["client", "status", "message"]),
            models.Index(fields=["message", "status"]),
        ]
