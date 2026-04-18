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
    IdentityInitAPIView,
    IdentityChallengeAPIView,
)
from users.api.v1.client.views.profile import ClientProfileAPIView
from users.api.v1.client.views.security import (
    TwoFactorSetupAPIView,
    TwoFactorVerifyAPIView,
    TwoFactorBackupCodesAPIView,
)

urlpatterns = [
    path("signup/request/", ClientSignUpRequestAPIView.as_view(), name="client-signup-request"),
    path("signup/verify/", ClientSignUpVerifyAPIView.as_view(), name="client-signup-verify"),
    path("signup/finalize/", ClientSignUpFinalizeAPIView.as_view(), name="client-signup-finalize"),
    path("login/", ClientLoginAPIView.as_view(), name="client-login"),
    path("identity/init/", IdentityInitAPIView.as_view(), name="client-identity-init"),
    path("identity/challenge/", IdentityChallengeAPIView.as_view(), name="client-identity-challenge"),
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
    # Profile & Identity
    path("profile/", ClientProfileAPIView.as_view(), name="client-profile"),
    path("security/2fa/setup/", TwoFactorSetupAPIView.as_view(), name="client-2fa-setup"),
    path("security/2fa/verify/", TwoFactorVerifyAPIView.as_view(), name="client-2fa-verify"),
    path("security/2fa/backup-codes/", TwoFactorBackupCodesAPIView.as_view(), name="client-2fa-backup-codes"),
]
