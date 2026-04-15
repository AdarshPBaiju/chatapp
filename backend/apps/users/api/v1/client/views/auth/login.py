from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from core.auth.request_context import (
    attach_device_entropy_cookie,
    generate_device_entropy,
    get_device_entropy,
)
from users.api.v1.client.serializers.auth import ClientLoginSerializer
from users.models import CustomUser
from users.services.auth_engine import AuthEngine
from users.services.user_services import UserService


class ClientLoginAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientLoginSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = CustomUser.objects.filter(email=email).first()
        if not user or not user.check_password(password):
            return ResponseFactory.error(
                message="Invalid email or password.",
                code=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            UserService.send_otp(user, ignore_cooldown=True)
            return ResponseFactory.success(
                message="Account verification required. A new OTP has been sent.",
                data={
                    "status": "pending_verification",
                    "user_id": str(user.id),
                    "email": user.email,
                    "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS,
                },
            )

        existing_entropy = get_device_entropy(request)
        issued_entropy = existing_entropy or generate_device_entropy()
        request.META["HTTP_X_DEVICE_ENTROPY"] = issued_entropy

        result = AuthEngine.issue_tokens(user, request)
        if result["status"] == "restricted":
            response = ResponseFactory.success(
                message=result["message"],
                data={
                    "is_restricted": True,
                    "access": result["access"],
                    "active_sessions": result["active_sessions"],
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "full_name": getattr(user.client, "full_name", ""),
                    },
                },
            )
            if not existing_entropy:
                attach_device_entropy_cookie(response, issued_entropy)
            return response

        response = ResponseFactory.success(
            message="Login successful.",
            data={
                "is_restricted": False,
                "access": result["access"],
                "refresh": result["refresh"],
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": getattr(user.client, "full_name", ""),
                },
            },
        )
        if not existing_entropy:
            attach_device_entropy_cookie(response, issued_entropy)
        return response
