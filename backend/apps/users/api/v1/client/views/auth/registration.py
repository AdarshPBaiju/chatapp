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
from users.api.v1.client.serializers.auth import (
    ClientSignUpRequestSerializer,
    ClientSignUpRequestResponseSerializer,
    ClientSignUpVerifySerializer,
    ClientSignUpVerifyResponseSerializer,
    ClientSignUpFinalizeSerializer,
    ClientRegistrationResendSerializer,
)
from users.services.user_services import UserService
from users.services.auth_engine import AuthEngine


class ClientSignUpRequestAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientSignUpRequestSerializer,
        responses={201: ClientSignUpRequestResponseSerializer},
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientSignUpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        UserService.initiate_signup(email)

        return ResponseFactory.created(
            message="Verification code sent to your email.",
            data={
                "email": email,
                "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS,
            },
        )


class ClientSignUpVerifyAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientSignUpVerifySerializer,
        responses={200: ClientSignUpVerifyResponseSerializer},
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientSignUpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        otp_code = serializer.validated_data["otp_code"]

        # Validate OTP and generate a signup token for the final step
        signup_token = UserService.verify_registration_otp(
            email=email,
            otp_code=otp_code,
            request=request,
        )

        if not signup_token:
            return ResponseFactory.error(
                message="Invalid or expired verification code.",
                errors={"otp_code": "The code provided is incorrect or has timed out."},
                code=status.HTTP_400_BAD_REQUEST,
                error_code="REGISTRATION_INVALID_CODE"
            )

        if signup_token == "ALREADY_EXISTS":
            return ResponseFactory.error(
                message="An account with this email already exists and is fully active. Please log in.",
                code=status.HTTP_409_CONFLICT,
                error_code="REGISTRATION_EMAIL_EXISTS"
            )

        return ResponseFactory.success(
            message="Verification successful.", data={"signup_token": signup_token}
        )


class ClientSignUpFinalizeAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientSignUpFinalizeSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientSignUpFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = UserService.finalize_signup(
            signup_token=serializer.validated_data["signup_token"],
            full_name=serializer.validated_data["full_name"],
            password=serializer.validated_data["password"],
            request=request,
        )

        if not user:
            return ResponseFactory.error(
                message="Registration failed. Code may have expired.",
                code=status.HTTP_400_BAD_REQUEST,
                error_code="REGISTRATION_FINALIZE_FAILED"
            )

        existing_entropy = get_device_entropy(request)
        issued_entropy = existing_entropy or generate_device_entropy()
        request.META["HTTP_X_DEVICE_ENTROPY"] = issued_entropy

        result = AuthEngine.issue_tokens(user, request)

        response_data = {
            "is_restricted": result["status"] == "restricted",
            "access": result["access"],
            "refresh": result["refresh"],
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": getattr(user.client, "full_name", ""),
            },
        }
        if result["status"] != "full":
            response_data["active_sessions"] = result["active_sessions"]

        response = ResponseFactory.success(
            message="Account activated successfully!", data=response_data
        )
        if not existing_entropy:
            attach_device_entropy_cookie(response, issued_entropy)
        return response


class ClientSignUpResendAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientRegistrationResendSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientRegistrationResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]

        # Re-trigger the registration OTP flow
        UserService.initiate_signup(email)

        return ResponseFactory.success(
            message="A fresh verification code has been dispatched to your email address."
        )
