from rest_framework import views, response, status, permissions
from users.models import Client
from ..serializers.rooms import RoomSerializer
from chat.services import ChatService

class GetOrCreateDMRoomView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, user_id):
        client_a = request.user.client
        try:
            client_b = Client.objects.get(id=user_id)
        except Client.DoesNotExist:
            return response.Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            room = ChatService.get_or_create_dm_room(client_a, client_b)
            serializer = RoomSerializer(room, context={"request": request})
            return response.Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return response.Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return response.Response({"detail": "An unexpected error occurred"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
