from django.urls import path
from authentication.registration.interfaces.views import (
    ClientSignUpRequestAPIView,
    ClientSignUpVerifyAPIView,
    ClientSignUpFinalizeAPIView,
    ClientSignUpResendAPIView,
)

urlpatterns = [
    path(
        "signup/request/", ClientSignUpRequestAPIView.as_view(), name="signup-request"
    ),
    path("signup/verify/", ClientSignUpVerifyAPIView.as_view(), name="signup-verify"),
    path(
        "signup/finalize/",
        ClientSignUpFinalizeAPIView.as_view(),
        name="signup-finalize",
    ),
    path("signup/resend/", ClientSignUpResendAPIView.as_view(), name="signup-resend"),
]
