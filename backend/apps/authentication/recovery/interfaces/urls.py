from django.urls import path
from authentication.recovery.interfaces.views import (
    ClientPasswordResetRequestAPIView,
    ClientPasswordResetVerifyAPIView,
    ClientPasswordResetConfirmAPIView,
    ClientPasswordChangeAPIView,
)

urlpatterns = [
    path(
        "password-reset/request/",
        ClientPasswordResetRequestAPIView.as_view(),
        name="password-reset-request",
    ),
    path(
        "password-reset/verify/",
        ClientPasswordResetVerifyAPIView.as_view(),
        name="password-reset-verify",
    ),
    path(
        "password-reset/confirm/",
        ClientPasswordResetConfirmAPIView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "password-change/",
        ClientPasswordChangeAPIView.as_view(),
        name="password-change",
    ),
]
