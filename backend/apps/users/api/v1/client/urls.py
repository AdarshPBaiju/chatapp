from django.urls import path
from users.api.v1.client.views.auth_views import (
    ClientSignUpAPIView,
    ClientOTPValidationAPIView,
    ClientResendOTPAPIView,
)

urlpatterns = [
    path("signup/", ClientSignUpAPIView.as_view(), name="client-signup"),
    path("otp-validate/", ClientOTPValidationAPIView.as_view(), name="client-otp-validate"),
    path("otp-resend/", ClientResendOTPAPIView.as_view(), name="client-otp-resend"),
]
