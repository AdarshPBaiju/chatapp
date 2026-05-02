from rest_framework import serializers
from chat.models import Message
from users.models import Client

class ChatMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "full_name", "avatar", "username"]

class MessageSerializer(serializers.ModelSerializer):
    sender = ChatMemberSerializer(read_only=True)
    
    class Meta:
        model = Message
        fields = [
            "id", 
            "sequence_id", 
            "sender", 
            "content", 
            "type", 
            "metadata", 
            "created_at"
        ]
