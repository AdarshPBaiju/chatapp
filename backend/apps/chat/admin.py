from django.contrib import admin
from chat.models import Room, RoomMembership, Message, MessageReceipt

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "type", "created_at"]
    search_fields = ["name", "id"]
    list_filter = ["type", "created_at"]

@admin.register(RoomMembership)
class RoomMembershipAdmin(admin.ModelAdmin):
    list_display = ["room", "client", "unread_count", "is_active", "created_at"]
    search_fields = ["room__name", "client__full_name"]
    list_filter = ["is_active", "created_at"]

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "sender", "room", "sequence_id", "type", "created_at"]
    search_fields = ["content", "sender__full_name", "room__name"]
    list_filter = ["type", "created_at"]
    readonly_fields = ["sequence_id", "created_at"]

@admin.register(MessageReceipt)
class MessageReceiptAdmin(admin.ModelAdmin):
    list_display = ["message", "client", "status", "read_at"]
    search_fields = ["message__id", "client__full_name"]
    list_filter = ["status", "read_at"]
