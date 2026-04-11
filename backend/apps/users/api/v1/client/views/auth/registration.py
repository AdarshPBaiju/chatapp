from __future__ import annotations


from django.conf import settings
from django.shortcuts import get_object_or_404
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
from users.api.v1.client.serializers.auth import (
    ClientSignUpSerializer,
    ClientOTPValidationSerializer,
    ClientResendOTPSerializer,
)
from users.services.user_services import UserService
from users.services.auth_engine import AuthEngine



class ClientSignUpAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientSignUpSerializer,
        responses={201: ClientSignUpSerializer},
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientSignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = UserService.create_user(serializer.validated_data)

        return ResponseFactory.created(
            message="Your account has been created successfully. Please check your email for the verification code.",
            data={
                "id": str(user.id),
                "email": user.email,
                "full_name": getattr(user.client, "full_name", ""),
                "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS,
            },
        )


class ClientOTPValidationAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientOTPValidationSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientOTPValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        otp_code = serializer.validated_data["otp_code"]

        from users.models import CustomUser

        user = get_object_or_404(CustomUser, id=user_id)
        existing_entropy = get_device_entropy(request)
        issued_entropy = existing_entropy or generate_device_entropy()
        request.META["HTTP_X_DEVICE_ENTROPY"] = issued_entropy
        is_valid = UserService.validate_otp(user, otp_code, request=request)

        if is_valid:
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])

            result = AuthEngine.issue_tokens(user, request)

            if result["status"] == "restricted":
                response = ResponseFactory.success(
                    message=result["message"],
                    data={
                        "is_restricted": True,
                        "access": result["access"],
                        "active_sessions": result["active_sessions"],
                    },
                    code=status.HTTP_200_OK,
                )
                if not existing_entropy:
                    attach_device_entropy_cookie(response, issued_entropy)
                return response

            response = ResponseFactory.success(
                message="Identification verified successfully. Welcome!",
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

        error_data = {"otp_code": "The code provided is incorrect or has timed out."}
        return ResponseFactory.error(
            message="Invalid or expired verification code.",
            errors=error_data,
            code=status.HTTP_400_BAD_REQUEST,
        )


class ClientResendOTPAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientResendOTPSerializer,
        responses={
            200: {"type": "object", "properties": {"success": {"type": "boolean"}}}
        },
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        from users.models import CustomUser

        user = get_object_or_404(CustomUser, id=user_id)

        if user.is_active:
            return ResponseFactory.error(
                message="This account is already verified.",
                code=status.HTTP_400_BAD_REQUEST,
            )

        UserService.send_otp(user)

        return ResponseFactory.success(
            message="A fresh verification code has been dispatched to your email address."
        )
