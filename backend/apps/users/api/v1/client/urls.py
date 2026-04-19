from django.urls import path
from users.api.v1.client.views.profile import ClientProfileAPIView

urlpatterns = [
    # Profile & Identity (Kept in users app for now)
    path("profile/", ClientProfileAPIView.as_view(), name="client-profile"),
]
