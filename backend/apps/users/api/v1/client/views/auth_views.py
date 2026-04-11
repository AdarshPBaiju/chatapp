from __future__ import annotations

import json

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from core.api.permissions import AllowRevokeOnly
from users.api.v1.client.serializers.auth_serializers import (
    ClientSignUpSerializer,
    ClientOTPValidationSerializer,
    ClientResendOTPSerializer,
    ClientSessionRevokeSerializer,
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
        is_valid = UserService.validate_otp(user, otp_code)

        if is_valid:
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])

            result = AuthEngine.issue_tokens(user, request)

            if result["status"] == "restricted":
                return ResponseFactory.success(
                    message=result["message"],
                    data={
                        "is_restricted": True,
                        "access": result["access"],
                        "active_sessions": result["active_sessions"],
                    },
                    code=status.HTTP_200_OK,
                )

            return ResponseFactory.success(
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
    permission_classes = [AllowRevokeOnly]

    @extend_schema(tags=["Client Security"])
    def get(self, request):
        """
        Retrieves all active sessions for the authenticated user from Redis.
        Allowed for both full and restricted tokens.
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
    permission_classes = [AllowRevokeOnly]

    @extend_schema(tags=["Client Security"])
    def post(self, request):
        """
        Invalidates the current session immediately.
        Allowed for both full and restricted tokens.
        """
        payload = request.auth

        AuthEngine.logout(
            user_id=str(request.user.id),
            access_jti=payload["jti"],
            refresh_jti=payload["partner_jti"],
        )

        return ResponseFactory.success(message="Logged out successfully.")


class ClientSessionRevokeAPIView(APIView):
    permission_classes = [AllowRevokeOnly]

    @extend_schema(request=ClientSessionRevokeSerializer, tags=["Client Security"])
    def post(self, request):
        """
        Remote logout functionality: Revokes a specific session by its access JTI.
        If the user is currently using a restricted token, this triggers auto-promotion.
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

                # Auto-Promotion Logic
                if request.auth.get("scope") == "revoke_only":
                    res = AuthEngine.promote_restricted_session(
                        user_id=user_id,
                        access_jti=request.auth["jti"],
                        refresh_jti=request.auth["partner_jti"],
                        request=request,
                    )
                    return ResponseFactory.success(
                        message="Session revoked. You have been granted full access.",
                        data={
                            "is_promoted": True,
                            "access": res["access"],
                            "refresh": res["refresh"],
                        },
                    )

                return ResponseFactory.success(
                    message="Remote session revoked successfully."
                )

        return ResponseFactory.error(message="Session not found or already expired.")
