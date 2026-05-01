from django.urls import path
from authentication.security.interfaces.views import (
    TwoFactorSetupAPIView,
    TwoFactorVerifyAPIView,
    TwoFactorBackupCodesAPIView,
    TwoFactorDisableAPIView,
    ClientGenericResendOTPAPIView,
    ClientGenericVerifyOTPAPIView,
)

urlpatterns = [
    path("2fa/setup/", TwoFactorSetupAPIView.as_view(), name="2fa-setup"),
    path("2fa/verify/", TwoFactorVerifyAPIView.as_view(), name="2fa-verify"),
    path(
        "2fa/backup-codes/",
        TwoFactorBackupCodesAPIView.as_view(),
        name="2fa-backup-codes",
    ),
    path("2fa/disable/", TwoFactorDisableAPIView.as_view(), name="2fa-disable"),
    path("otp-resend/", ClientGenericResendOTPAPIView.as_view(), name="otp-resend"),
    path("otp-verify/", ClientGenericVerifyOTPAPIView.as_view(), name="otp-verify"),
]
