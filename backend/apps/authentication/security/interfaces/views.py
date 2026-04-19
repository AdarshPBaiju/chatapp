from __future__ import annotations

import pyotp
from django.shortcuts import get_object_or_404
from rest_framework import views, permissions, status
from drf_spectacular.utils import extend_schema
from core.api.responses import ResponseFactory
from users.models import CustomUser
from authentication.core.request_context import (
    attach_device_entropy_cookie,
    generate_device_entropy,
    get_device_entropy,
)
from authentication.identity.application.services import LoginService
from authentication.security.application.services import (
    OtpDeliveryService,
    OtpValidationService,
)
from authentication.security.infrastructure.serializers import (
    TwoFactorVerifySerializer,
    TwoFactorRecoverySerializer,
    ClientGenericResendOTPSerializer,
    ClientGenericVerifyOTPSerializer,
)


class TwoFactorSetupAPIView(views.APIView):
    """
    Step 1: Generate a TOTP secret and return the provisioning URI.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        client = request.user.client
        if client.is_two_factor_enabled:
            return ResponseFactory.error(
                message="2FA is already enabled for this account.",
                code=status.HTTP_400_BAD_REQUEST,
                error_code="IDENTITY_ALREADY_ENABLED",
            )

        if not client.totp_secret:
            client.totp_secret = pyotp.random_base32()
            client.save()

        totp = pyotp.TOTP(client.totp_secret)
        provisioning_uri = totp.provisioning_uri(
            name=request.user.email, issuer_name="ChitChat"
        )

        return ResponseFactory.success(
            message="2FA setup initiated.",
            data={"secret": client.totp_secret, "provisioning_uri": provisioning_uri},
        )


class TwoFactorVerifyAPIView(views.APIView):
    """
    Step 2: Verify the 6-digit code.
    Enables 2FA and returns backup codes.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client = request.user.client
        code = serializer.validated_data["code"]

        totp = pyotp.TOTP(client.totp_secret)
        if not totp.verify(code):
            return ResponseFactory.error(
                message="Invalid verification code.", code=status.HTTP_400_BAD_REQUEST
            )

        client.is_two_factor_enabled = True
        backup_codes = client.generate_and_set_backup_codes()
        client.save()

        return ResponseFactory.success(
            message="2FA successfully enabled.", data={"backup_codes": backup_codes}
        )


class TwoFactorBackupCodesAPIView(views.APIView):
    """
    View or regenerate backup codes. Requires password re-auth.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorRecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data["password"]):
            return ResponseFactory.error(
                message="Incorrect password verification.",
                code=status.HTTP_401_UNAUTHORIZED,
            )

        client = request.user.client
        # Always regenerate fresh codes when this endpoint is called via POST
        backup_codes = client.generate_and_set_backup_codes()

        return ResponseFactory.success(
            message="Fresh backup codes generated successfully.",
            data={"backup_codes": backup_codes},
        )


class TwoFactorDisableAPIView(views.APIView):
    """
    Disable 2FA. Requires password verification.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorRecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data["password"]):
            return ResponseFactory.error(
                message="Incorrect password verification.",
                code=status.HTTP_401_UNAUTHORIZED,
            )

        client = request.user.client
        client.is_two_factor_enabled = False
        client.totp_secret = ""
        client.backup_codes = []
        client.save()

        # Security Hardening: Revoke other sessions when MFA is disabled
        from authentication.sessions.application.services import SessionManager
        current_sid = request.auth.get("sid") if request.auth else None
        SessionManager.revoke_all_sessions(
            str(request.user.id),
            exclude_session_id=str(current_sid) if current_sid else None,
        )

        return ResponseFactory.success(message="2FA successfully disabled.")


class ClientGenericResendOTPAPIView(views.APIView):
    permission_classes = [permissions.AllowAny]

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

        purpose = "registration" if not user.is_active else "password_reset"
        OtpDeliveryService.send_otp(user, email=user.email, purpose=purpose)

        return ResponseFactory.success(
            message="A fresh verification code has been dispatched to your email address."
        )


class ClientGenericVerifyOTPAPIView(views.APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        request=ClientGenericVerifyOTPSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientGenericVerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_object_or_404(CustomUser, id=serializer.validated_data["user_id"])
        otp_code = serializer.validated_data["otp_code"]

        if user.is_active:
            return ResponseFactory.error(
                message="Account is already verified.",
                code=status.HTTP_409_CONFLICT,
                error_code="REGISTRATION_ALREADY_VERIFIED",
            )

        if not OtpValidationService.validate_otp(
            str(user.id), otp_code, purpose="registration", request=request
        ):
            return ResponseFactory.error(
                message="Invalid or expired verification code.",
                code=status.HTTP_400_BAD_REQUEST,
                error_code="REGISTRATION_INVALID_CODE",
            )

        user.is_active = True
        user.save(update_fields=["is_active"])

        existing_entropy = get_device_entropy(request)
        issued_entropy = existing_entropy or generate_device_entropy()
        request.META["HTTP_X_DEVICE_ENTROPY"] = issued_entropy

        result = LoginService.issue_tokens(user, request)
        response_data = {
            "is_restricted": result["status"] == "restricted",
            "access": result["access"],
            "refresh": result["refresh"],
            "access_exp": result["access_exp"],
            "refresh_exp": result["refresh_exp"],
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": getattr(user.client, "full_name", ""),
            },
        }
        if result["status"] == "restricted":
            response_data["active_sessions"] = result["active_sessions"]

        response = ResponseFactory.success(
            message="Account verified successfully.",
            data=response_data,
        )
        if not existing_entropy:
            attach_device_entropy_cookie(response, issued_entropy)
        return response
