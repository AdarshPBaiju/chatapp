from django.urls import path
from users.api.v1.client.views.auth import (
    ClientSignUpAPIView,
    ClientOTPValidationAPIView,
    ClientResendOTPAPIView,
    ClientSessionListAPIView,
    ClientLogoutAPIView,
    ClientSessionRevokeAPIView,
    ClientTokenVerifyAPIView,
    ClientTokenRefreshAPIView,
)

urlpatterns = [
    path("signup/", ClientSignUpAPIView.as_view(), name="client-signup"),
    path(
        "otp-validate/",
        ClientOTPValidationAPIView.as_view(),
        name="client-otp-validate",
    ),
    path("otp-resend/", ClientResendOTPAPIView.as_view(), name="client-otp-resend"),
    # Token Protocols
    path(
        "token/verify/", ClientTokenVerifyAPIView.as_view(), name="client-token-verify"
    ),
    path(
        "token/refresh/",
        ClientTokenRefreshAPIView.as_view(),
        name="client-token-refresh",
    ),
    # Security & Session Management
    path("sessions/", ClientSessionListAPIView.as_view(), name="client-sessions"),
    path("logout/", ClientLogoutAPIView.as_view(), name="client-logout"),
    path(
        "sessions/revoke/",
        ClientSessionRevokeAPIView.as_view(),
        name="client-session-revoke",
    ),
]
