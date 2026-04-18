from rest_framework import generics, permissions
from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.profile import ClientProfileSerializer


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
