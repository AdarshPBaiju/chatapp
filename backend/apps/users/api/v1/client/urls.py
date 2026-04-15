from django.urls import path
from users.api.v1.client.views.auth import (
    ClientSignUpRequestAPIView,
    ClientSignUpVerifyAPIView,
    ClientSignUpFinalizeAPIView,
    ClientSignUpResendAPIView,
    ClientLoginAPIView,
    ClientPasswordResetRequestAPIView,
    ClientPasswordResetVerifyAPIView,
    ClientPasswordResetConfirmAPIView,
    ClientPasswordChangeAPIView,
    ClientGenericResendOTPAPIView,
    ClientSessionListAPIView,
    ClientLogoutAPIView,
    ClientSessionRevokeAPIView,
    ClientSessionRevokeOthersAPIView,
    ClientTokenVerifyAPIView,
    ClientTokenRefreshAPIView,
)

urlpatterns = [
    path("signup/request/", ClientSignUpRequestAPIView.as_view(), name="client-signup-request"),
    path("signup/verify/", ClientSignUpVerifyAPIView.as_view(), name="client-signup-verify"),
    path("signup/finalize/", ClientSignUpFinalizeAPIView.as_view(), name="client-signup-finalize"),
    path("login/", ClientLoginAPIView.as_view(), name="client-login"),
    path(
        "password-reset/request/",
        ClientPasswordResetRequestAPIView.as_view(),
        name="client-password-reset-request",
    ),
    path(
        "password-reset/verify/",
        ClientPasswordResetVerifyAPIView.as_view(),
        name="client-password-reset-verify",
    ),
    path(
        "password-reset/confirm/",
        ClientPasswordResetConfirmAPIView.as_view(),
        name="client-password-reset-confirm",
    ),
    path(
        "password-change/",
        ClientPasswordChangeAPIView.as_view(),
        name="client-password-change",
    ),
    path("signup/resend/", ClientSignUpResendAPIView.as_view(), name="client-signup-resend"),
    path("otp-resend/", ClientGenericResendOTPAPIView.as_view(), name="client-otp-resend"),
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
    path(
        "sessions/revoke-others/",
        ClientSessionRevokeOthersAPIView.as_view(),
        name="client-session-revoke-others",
    ),
]
