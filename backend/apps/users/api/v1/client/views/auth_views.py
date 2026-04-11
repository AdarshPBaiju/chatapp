from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from users.models import CustomUser
from users.api.v1.client.serializers.auth_serializers import (
    ClientSignUpSerializer,
    ClientOTPValidationSerializer,
    ClientResendOTPSerializer,
)
from users.services.user_services import UserService


class ClientSignUpAPIView(APIView):
    """
    Handles autonomous registration for new clients.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientSignUpSerializer,
        responses={201: ClientSignUpSerializer},
        tags=["Client Auth"],
    )
    def post(self, request):
        """
        Processes signup request, performs validation, and initializes the client profile.
        Returns a professionally formatted success response using ResponseFactory.
        """
        serializer = ClientSignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = UserService.create_user(serializer.validated_data)

        return ResponseFactory.created(
            message="Your account has been created successfully. Please check your email for the verification code.",
            data={
                "id": str(user.id),
                "email": user.email,
                "full_name": getattr(user.client, "full_name", ""),
                "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS
            }
        )


class ClientOTPValidationAPIView(APIView):
    """
    Endpoint for verifying 2FA codes and performing automatic login.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientOTPValidationSerializer,
        responses={
            200: {"type": "object", "properties": {
                "access": {"type": "string"},
                "refresh": {"type": "string"},
                "user": {"type": "object"}
            }}
        },
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientOTPValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        otp_code = serializer.validated_data["otp_code"]

        user = get_object_or_404(CustomUser, id=user_id)
        is_valid = UserService.validate_otp(user, otp_code)

        if is_valid:
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])

            refresh = RefreshToken.for_user(user)

            return ResponseFactory.success(
                message="Identification verified successfully. Welcome to CIRCO!",
                data={
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user": {"id": user.id, "email": user.email}
                }
            )

        return ResponseFactory.error(
            message="Invalid or expired verification code.",
            errors={"otp_code": "The code provided is incorrect or has timed out."},
            code=status.HTTP_400_BAD_REQUEST
        )


class ClientResendOTPAPIView(APIView):
    """
    Allows clients to request a new verification code if needed.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientResendOTPSerializer,
        responses={200: {"type": "object", "properties": {"success": {"type": "boolean"}}}},
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        user = get_object_or_404(CustomUser, id=user_id)

        if user.is_active:
            return ResponseFactory.error(
                message="This account is already verified.",
                code=status.HTTP_400_BAD_REQUEST
            )

        UserService.send_otp(user)

        return ResponseFactory.success(
            message="A fresh verification code has been dispatched to your email address."
        )
