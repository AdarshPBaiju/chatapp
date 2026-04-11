from __future__ import annotations

import json

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.auth_serializers import (
    ClientSignUpSerializer,
    ClientOTPValidationSerializer,
    ClientResendOTPSerializer,
    ClientSessionRevokeSerializer,
)
from users.services.user_services import UserService
from users.services.auth_engine import AuthEngine
from core.auth.crypto import AuthCryptoEngine


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
        responses={
            200: {
                "type": "object",
                "properties": {
                    "access": {"type": "string"},
                    "refresh": {"type": "string"},
                    "user": {"type": "object"},
                },
            }
        },
        tags=["Client Auth"],
    )
    def post(self, request):
        serializer = ClientOTPValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        otp_code = serializer.validated_data["otp_code"]

        from users.models import CustomUser

        user = get_object_or_404(CustomUser, id=user_id)
        is_valid = UserService.validate_otp(user, otp_code)

        if is_valid:
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])

            tokens = AuthEngine.issue_tokens(user, request)

            return ResponseFactory.success(
                message="Identification verified successfully. Welcome!",
                data={
                    "access": tokens["access"],
                    "refresh": tokens["refresh"],
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "full_name": getattr(user.client, "full_name", ""),
                    },
                },
            )

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


class ClientSessionListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Client Security"])
    def get(self, request):
        """
        Retrieves all active sessions for the authenticated user from Redis.
        """
        user_id = str(request.user.id)
        active_key = f"auth:active_sessions:{user_id}"
        conn = cache.client.get_client()

        sessions = conn.zrange(active_key, 0, -1)
        data = [json.loads(s.decode()) for s in sessions]

        return ResponseFactory.success(
            message="Active sessions retrieved successfully.", data=data
        )


class ClientLogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Client Security"])
    def post(self, request):
        """
        Invalidates the current session immediately.
        """
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        token = auth_header.split(" ")[1]
        payload = AuthCryptoEngine.decrypt_and_verify(token)

        AuthEngine.logout(
            user_id=str(request.user.id),
            access_jti=payload["jti"],
            refresh_jti=payload["refresh_jti"],
        )

        return ResponseFactory.success(message="Logged out successfully.")


class ClientSessionRevokeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ClientSessionRevokeSerializer, tags=["Client Security"])
    def post(self, request):
        """
        Remote logout functionality: Revokes a specific session by its access JTI.
        """
        serializer = ClientSessionRevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_jti = serializer.validated_data["access_jti"]
        user_id = str(request.user.id)
        active_key = f"auth:active_sessions:{user_id}"
        conn = cache.client.get_client()

        sessions = conn.zrange(active_key, 0, -1)
        for s in sessions:
            meta = json.loads(s.decode())
            if meta["access_jti"] == target_jti:
                AuthEngine.logout(
                    user_id=user_id,
                    access_jti=meta["access_jti"],
                    refresh_jti=meta["refresh_jti"],
                )
                return ResponseFactory.success(
                    message="Remote session revoked successfully."
                )

        return ResponseFactory.error(message="Session not found or already expired.")
