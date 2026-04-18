from __future__ import annotations

from .registration import (
    ClientSignUpRequestAPIView,
    ClientSignUpVerifyAPIView,
    ClientSignUpFinalizeAPIView,
    ClientSignUpResendAPIView,
)
from .otp import ClientGenericResendOTPAPIView
from .login import ClientLoginAPIView
from .password_reset import (
    ClientPasswordResetRequestAPIView,
    ClientPasswordResetVerifyAPIView,
    ClientPasswordResetConfirmAPIView,
    ClientPasswordChangeAPIView,
)
from .sessions import (
    ClientSessionListAPIView,
    ClientLogoutAPIView,
    ClientSessionRevokeAPIView,
    ClientSessionRevokeOthersAPIView,
)
from .tokens import ClientTokenVerifyAPIView, ClientTokenRefreshAPIView
from .identity import IdentityInitAPIView, IdentityChallengeAPIView

__all__ = [
    "ClientSignUpRequestAPIView",
    "ClientSignUpVerifyAPIView",
    "ClientSignUpFinalizeAPIView",
    "ClientSignUpResendAPIView",
    "ClientLoginAPIView",
    "ClientPasswordResetRequestAPIView",
    "ClientPasswordResetVerifyAPIView",
    "ClientPasswordResetConfirmAPIView",
    "ClientPasswordChangeAPIView",
    "ClientGenericResendOTPAPIView",
    "ClientSessionListAPIView",
    "ClientLogoutAPIView",
    "ClientSessionRevokeAPIView",
    "ClientSessionRevokeOthersAPIView",
    "ClientTokenVerifyAPIView",
    "ClientTokenRefreshAPIView",
    "IdentityInitAPIView",
    "IdentityChallengeAPIView",
]
