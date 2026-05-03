from rest_framework import serializers
from users.models import Client, Contact


class UserSearchSerializer(serializers.ModelSerializer):
    user_id = serializers.ReadOnlyField(source="user.id")
    is_contact = serializers.SerializerMethodField()
    contact_status = serializers.SerializerMethodField()
    nickname = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    total_contacts = serializers.SerializerMethodField()
    mutual_contacts = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id",
            "user_id",
            "full_name",
            "username",
            "email",
            "profile_picture",
            "banner_picture",
            "bio",
            "gender",
            "date_joined",
            "is_contact",
            "contact_status",
            "nickname",
            "total_contacts",
            "mutual_contacts",
        ]

    def get_email(self, obj: Client) -> str:
        # Respect email masking
        if obj.is_email_masked:
            return obj.masked_email
        return obj.user.email

    def get_is_contact(self, obj: Client) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Contact.objects.filter(owner=request.user.client, contact_user=obj).exists()

    def get_contact_status(self, obj: Client) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        
        # Check if we own a record for this user (Outgoing, Accepted, or Blocked)
        contact = Contact.objects.filter(owner=request.user.client, contact_user=obj).first()
        if contact:
            return contact.status
            
        # Check if they own a PENDING record for us (Incoming)
        incoming = Contact.objects.filter(owner=obj, contact_user=request.user.client, status=Contact.Status.PENDING).first()
        if incoming:
            return "incoming"
            
        return None

    def get_nickname(self, obj: Client) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        contact = Contact.objects.filter(owner=request.user.client, contact_user=obj).first()
        return contact.nickname if contact else None

    def get_total_contacts(self, obj: Client) -> int:
        return Contact.objects.filter(owner=obj, status=Contact.Status.ACCEPTED).count()

    def get_mutual_contacts(self, obj: Client) -> int:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return 0
        
        my_contacts = set(Contact.objects.filter(owner=request.user.client, status=Contact.Status.ACCEPTED).values_list("contact_user_id", flat=True))
        their_contacts = set(Contact.objects.filter(owner=obj, status=Contact.Status.ACCEPTED).values_list("contact_user_id", flat=True))
        
        return len(my_contacts.intersection(their_contacts))
