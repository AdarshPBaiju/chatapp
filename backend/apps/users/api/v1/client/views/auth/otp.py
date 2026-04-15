from __future__ import annotations
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from users.models import CustomUser
from users.services.user_services import UserService
from users.api.v1.client.serializers.auth.otp import ClientGenericResendOTPSerializer

class ClientGenericResendOTPAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientGenericResendOTPSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientGenericResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data.get("user_id")
        email = serializer.validated_data.get("email")

        if user_id:
            user = get_object_or_404(CustomUser, id=user_id)
        else:
            user = get_object_or_404(CustomUser, email__iexact=email)

        purpose = (
            UserService.OTP_PURPOSE_REGISTRATION
            if not user.is_active
            else UserService.OTP_PURPOSE_PASSWORD_RESET
        )

        UserService.send_otp(user, email=user.email, purpose=purpose)

        return ResponseFactory.success(
            message="A fresh verification code has been dispatched to your email address."
        )
