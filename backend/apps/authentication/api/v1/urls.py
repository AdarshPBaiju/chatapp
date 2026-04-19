from django.urls import path, include

urlpatterns = [
    path("identity/", include("authentication.identity.interfaces.urls")),
    path("registration/", include("authentication.registration.interfaces.urls")),
    path("recovery/", include("authentication.recovery.interfaces.urls")),
    path("sessions/", include("authentication.sessions.interfaces.urls")),
    path("security/", include("authentication.security.interfaces.urls")),
]
