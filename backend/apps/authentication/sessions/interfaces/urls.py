from django.urls import path
from authentication.sessions.interfaces.views import (
    ClientSessionListAPIView,
    ClientSessionRevokeAPIView,
    ClientSessionRevokeOthersAPIView,
    ClientSessionPromoteAPIView,
    ClientLogoutAPIView,
    GeoLocationAPIView,
)

urlpatterns = [
    path("list/", ClientSessionListAPIView.as_view(), name="session-list"),
    path("logout/", ClientLogoutAPIView.as_view(), name="session-logout"),
    path("revoke/", ClientSessionRevokeAPIView.as_view(), name="session-revoke"),
    path(
        "revoke/others/",
        ClientSessionRevokeOthersAPIView.as_view(),
        name="session-revoke-others",
    ),
    path("promote/", ClientSessionPromoteAPIView.as_view(), name="session-promote"),
    path("geodata/", GeoLocationAPIView.as_view(), name="geodata"),
]
