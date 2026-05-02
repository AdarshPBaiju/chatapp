from django.urls import path
from .api.v1.views.messages import MessageHistoryAPIView
from .api.v1.views.rooms import RoomListAPIView

urlpatterns = [
    path("v1/rooms/", RoomListAPIView.as_view(), name="room-list"),
    path("v1/rooms/<uuid:room_id>/history/", MessageHistoryAPIView.as_view(), name="message-history"),
]
