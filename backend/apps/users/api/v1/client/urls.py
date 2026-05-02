from django.urls import path
from users.api.v1.client.views.profile import ClientProfileAPIView, CheckUsernameAPIView
from users.api.v1.client.views.discovery import (
    UserDiscoveryAPIView,
    ContactManagementAPIView,
    ContactListAPIView,
    PublicClientProfileAPIView,
)

urlpatterns = [
    # Profile & Identity
    path("profile/", ClientProfileAPIView.as_view(), name="client-profile"),
    path("profile/check-username/", CheckUsernameAPIView.as_view(), name="check-username"),
    
    # Discovery & Contacts
    path("discovery/search/", UserDiscoveryAPIView.as_view(), name="user-search"),
    path("profile/public/<uuid:id>/", PublicClientProfileAPIView.as_view(), name="public-profile"),
    path("contacts/", ContactListAPIView.as_view(), name="contact-list"),
    path("contacts/manage/", ContactManagementAPIView.as_view(), name="contact-manage"),
]
