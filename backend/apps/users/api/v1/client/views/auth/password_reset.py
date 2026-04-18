from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.permissions import FullAccessRequired
from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.auth import (
    ClientPasswordChangeSerializer,
    ClientPasswordResetConfirmSerializer,
    ClientPasswordResetVerifySerializer,
    ClientPasswordResetRequestSerializer,
)
from users.services.auth_engine import AuthEngine
from users.services.user_services import UserService
from users.models import CustomUser


class ClientPasswordResetRequestAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientPasswordResetRequestSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientPasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data.get("email") or _authenticated_email(request)
        if not email:
            return ResponseFactory.error(
                message="Email address is required.",
                error_code="PASSWORD_RESET_EMAIL_REQUIRED"
            )

        UserService.request_password_reset(email)

        return ResponseFactory.success(
            message="If an active account exists for this email, a reset code has been sent.",
            data={
                "email": email,
                "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS,
            },
        )


class ClientPasswordResetVerifyAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientPasswordResetVerifySerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientPasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        otp_code = serializer.validated_data["otp_code"]

        is_valid = UserService.verify_password_reset_otp(
            email=email, otp_code=otp_code, request=request
        )
        if not is_valid:
            return ResponseFactory.error(
                message="Invalid or expired verification code.",
                errors={"otp_code": "The code provided is incorrect or has timed out."},
                code=status.HTTP_400_BAD_REQUEST,
                error_code="PASSWORD_RESET_INVALID_CODE"
            )

        user = CustomUser.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return ResponseFactory.error(
                message="Code verified, but no active account was found for this email address. Please sign up instead.",
                code=status.HTTP_404_NOT_FOUND,
                error_code="PASSWORD_RESET_USER_NOT_FOUND"
            )

        reset_token = UserService.generate_password_reset_token(user)

        return ResponseFactory.success(
            message="Verification successful.", data={"reset_token": reset_token}
        )


class ClientPasswordResetConfirmAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientPasswordResetConfirmSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientPasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        is_reset = UserService.reset_password_with_token(
            reset_token=serializer.validated_data["reset_token"],
            password=serializer.validated_data["password"],
            request=request,
        )
        if not is_reset:
            return ResponseFactory.error(
                message="Invalid or expired reset token.",
                errors={"reset_token": "The reset operation could not be completed."},
                code=status.HTTP_400_BAD_REQUEST,
                error_code="PASSWORD_RESET_TOKEN_INVALID"
            )

        return ResponseFactory.success(
            message="Password updated successfully. Please log in with your new password."
        )


class ClientPasswordChangeAPIView(APIView):
    permission_classes = [FullAccessRequired]

    @extend_schema(
        request=ClientPasswordChangeSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientPasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        old_password = serializer.validated_data["old_password"]
        if not user.check_password(old_password):
            return ResponseFactory.error(
                message="Current password is incorrect.",
                errors={
                    "old_password": "The current password you entered is incorrect."
                },
                code=status.HTTP_400_BAD_REQUEST,
                error_code="PASSWORD_CHANGE_INVALID_CURRENT"
            )

        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])

        current_sid = request.auth.get("sid")
        revoked_count = AuthEngine.revoke_all_sessions(
            str(user.id),
            exclude_session_id=str(current_sid) if current_sid else None,
        )

        return ResponseFactory.success(
            message="Password changed successfully.",
            data={"revoked_sessions": revoked_count},
        )


def _authenticated_email(request) -> str | None:
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return user.email
    return None
