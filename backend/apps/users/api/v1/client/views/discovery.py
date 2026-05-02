from rest_framework import generics, permissions, status
from django.db.models import Q
from users.models import Client, Contact
from core.api.responses import ResponseFactory
from ..serializers.discovery import UserSearchSerializer


class UserDiscoveryAPIView(generics.ListAPIView):
    """
    Search for users by username or email.
    """

    serializer_class = UserSearchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        query = self.request.query_params.get("q", "")
        if not query:
            return Client.objects.none()

        # Search by username (partial) or primary email (exact match for privacy)
        return Client.objects.filter(
            Q(username__icontains=query) | 
            Q(user__email__iexact=query)
        ).exclude(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return ResponseFactory.success(
            message="Search results retrieved.", data=serializer.data
        )


class ContactManagementAPIView(generics.GenericAPIView):
    """
    Manage contact connections (Add, Accept, Decline, Block, Update Nickname).
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        action = request.data.get("action")
        target_client_id = request.data.get("client_id")

        if not action or not target_client_id:
            return ResponseFactory.error(
                message="Action and client_id are required.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        owner = request.user.client
        try:
            target = Client.objects.get(id=target_client_id)
        except Client.DoesNotExist:
            return ResponseFactory.error(message="Target user not found.")

        if action == "add":
            # Check if already contacts
            if Contact.objects.filter(owner=owner, contact_user=target).exists():
                return ResponseFactory.error(
                    message="Contact already exists or request pending."
                )

            # Create outgoing request
            Contact.objects.create(
                owner=owner, contact_user=target, status=Contact.Status.PENDING
            )
            return ResponseFactory.success(message="Friend request sent.")

        elif action == "accept":
            # Accept incoming request
            # Target becomes owner of the PENDING entry
            incoming = Contact.objects.filter(
                owner=target, contact_user=owner, status=Contact.Status.PENDING
            ).first()
            if not incoming:
                return ResponseFactory.error(message="No pending request found.")

            incoming.status = Contact.Status.ACCEPTED
            incoming.save()

            # Create reciprocal entry with optional nickname
            nickname = request.data.get("nickname", "") or ""
            Contact.objects.get_or_create(
                owner=owner,
                contact_user=target,
                defaults={"status": Contact.Status.ACCEPTED, "nickname": nickname},
            )
            return ResponseFactory.success(message="Friend request accepted.")

        elif action == "decline":
            Contact.objects.filter(
                owner=target, contact_user=owner, status=Contact.Status.PENDING
            ).delete()
            return ResponseFactory.success(message="Friend request declined.")

        elif action == "block":
            Contact.objects.update_or_create(
                owner=owner, 
                contact_user=target, 
                defaults={"status": Contact.Status.BLOCKED}
            )
            return ResponseFactory.success(message="User blocked.")

        elif action == "unblock":
            Contact.objects.filter(owner=owner, contact_user=target, status=Contact.Status.BLOCKED).delete()
            return ResponseFactory.success(message="User unblocked.")

        elif action == "remove":
            # Remove from both sides
            Contact.objects.filter(
                Q(owner=owner, contact_user=target)
                | Q(owner=target, contact_user=owner)
            ).delete()
            return ResponseFactory.success(message="Contact removed.")

        elif action == "update_nickname":
            nickname = request.data.get("nickname", "") or ""
            contact = Contact.objects.filter(owner=owner, contact_user=target).first()
            if not contact:
                return ResponseFactory.error(message="Contact not found.")

            contact.nickname = nickname
            contact.save()
            return ResponseFactory.success(message="Nickname updated.")

        return ResponseFactory.error(message="Invalid action.")


class ContactListAPIView(generics.ListAPIView):
    """
    Retrieve contact lists (Accepted, Pending, Blocked).
    """

    serializer_class = UserSearchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        list_type = self.request.query_params.get("type", "accepted")
        owner = self.request.user.client

        if list_type == "pending":
            # Incoming requests
            return Client.objects.filter(
                contacts__contact_user=owner, contacts__status=Contact.Status.PENDING
            )

        # Accepted or Blocked
        status_map = {
            "accepted": Contact.Status.ACCEPTED,
            "blocked": Contact.Status.BLOCKED,
        }
        target_status = status_map.get(list_type, Contact.Status.ACCEPTED)

        return Client.objects.filter(
            contacted_by__owner=owner, contacted_by__status=target_status
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return ResponseFactory.success(
            message="Contacts retrieved.", data=serializer.data
        )


class PublicClientProfileAPIView(generics.RetrieveAPIView):
    """
    Retrieve public profile of another user.
    """

    queryset = Client.objects.all()
    serializer_class = UserSearchSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "id"

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ResponseFactory.success(
            message="Public profile retrieved.", data=serializer.data
        )
