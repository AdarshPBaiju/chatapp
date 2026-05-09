from django.urls import path
from .api.v1.views.messages import MessageHistoryAPIView
from .api.v1.views.rooms import RoomListAPIView, RoomDetailAPIView
from .api.v1.views.direct_messages import GetOrCreateDMRoomView

urlpatterns = [
    path("v1/rooms/", RoomListAPIView.as_view(), name="room-list"),
    path("v1/rooms/<uuid:room_id>/", RoomDetailAPIView.as_view(), name="room-detail"),
    path("v1/rooms/dm/<uuid:user_id>/", GetOrCreateDMRoomView.as_view(), name="get-or-create-dm"),
    path("v1/rooms/<uuid:room_id>/history/", MessageHistoryAPIView.as_view(), name="message-history"),
]
