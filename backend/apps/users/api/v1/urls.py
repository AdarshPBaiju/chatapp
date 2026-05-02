from django.urls import path, include

urlpatterns = [
    path("users/client/", include("users.api.v1.client.urls")),
]
