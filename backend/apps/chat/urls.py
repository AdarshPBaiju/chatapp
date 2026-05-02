from django.urls import path
from .api.v1.views.messages import MessageHistoryAPIView

urlpatterns = [
    path("v1/rooms/<uuid:room_id>/history/", MessageHistoryAPIView.as_view(), name="message-history"),
]
