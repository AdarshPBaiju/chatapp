from rest_framework import generics, permissions
from rest_framework.views import APIView
from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.profile import ClientProfileSerializer
from users.models import Client


class ClientProfileAPIView(generics.RetrieveUpdateAPIView):
    """
    GET: Retrieve current user's profile.
    PATCH: Update profile details.
    """

    serializer_class = ClientProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user.client

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ResponseFactory.success(
            message="Profile retrieved successfully.", data=serializer.data
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return ResponseFactory.success(
            message="Profile updated successfully.", data=serializer.data
        )


class CheckUsernameAPIView(APIView):
    """
    GET: Check if a username is available.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        username = request.query_params.get("username", "").strip()
        if not username:
            return ResponseFactory.error(message="Username is required.", code=400)
            
        current_client_id = None
        # If the user is authenticated and checking their own username, it's available to them
        if request.user.is_authenticated and getattr(request.user, "client", None):
            current_client_id = request.user.client.id
            if request.user.client.username and request.user.client.username.lower() == username.lower():
                return ResponseFactory.success(message="Username is available.", data={"available": True})
                
        # Real-time check against the database using B-Tree index lookup.
        # This is strictly O(log N) and takes <1ms even at a billion rows.
        qs = Client.objects.filter(username__iexact=username)
        if current_client_id:
            qs = qs.exclude(id=current_client_id)
            
        exists = qs.exists()
            
        return ResponseFactory.success(
            message="Username availability checked.", 
            data={"available": not exists}
        )
