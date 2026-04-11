from django.urls import include, path

urlpatterns = [
    path("v1/", include("users.api.v1.urls")),
]
