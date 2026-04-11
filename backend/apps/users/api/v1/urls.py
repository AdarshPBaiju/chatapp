from django.urls import path, include

urlpatterns = [
    path("client/", include("users.api.v1.client.urls")),
]
