from __future__ import annotations


from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.auth import (
    ClientTokenVerifySerializer,
    ClientTokenRefreshSerializer,
)
from users.services.auth_engine import AuthEngine
from core.auth.crypto import AuthCryptoEngine


class ClientTokenVerifyAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientTokenVerifySerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        """
        Public endpoint to verify if a token is valid, decrypted,
        and matches the current hardware context.
        """
        serializer = ClientTokenVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["token"]

        try:
            payload = AuthCryptoEngine.decrypt_and_verify(token)

            # Blacklist check
            jti = payload.get("jti")
            if cache.get(f"auth:blacklist:{jti}"):
                return ResponseFactory.error(
                    message="Token has been blacklisted or revoked."
                )

            # Hardware Fingerprint check
            current_fpt = AuthCryptoEngine.generate_fingerprint(request)
            if payload.get("fpt") != current_fpt:
                return ResponseFactory.error(message="Security context mismatch.")

            return ResponseFactory.success(
                message="Token is valid and cryptographically secure.",
                data={"scope": payload.get("scope", "unknown")},
            )

        except ValueError as e:
            return ResponseFactory.error(
                message=str(e), code=status.HTTP_401_UNAUTHORIZED
            )


class ClientTokenRefreshAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientTokenRefreshSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        """
        Premium Token Rotation API.
        Validates the refresh token and atomically swaps the session in Redis.
        Blacklists the old Refresh JTI to prevent replay attacks.
        """
        serializer = ClientTokenRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        refresh_token = serializer.validated_data["refresh"]

        try:
            payload = AuthCryptoEngine.decrypt_and_verify(refresh_token)

            # 1. Integrity Checks
            if payload.get("type") != "refresh":
                return ResponseFactory.error(
                    message="Invalid token category (expected Refresh)."
                )

            jti = payload.get("jti")
            if cache.get(f"auth:blacklist:{jti}"):
                return ResponseFactory.error(
                    message="Refresh token has been revoked or reused."
                )

            current_fpt = AuthCryptoEngine.generate_fingerprint(request)
            if payload.get("fpt") != current_fpt:
                return ResponseFactory.error(message="Security context mismatch.")

            # 2. Identify target user
            from users.models import CustomUser

            user = CustomUser.objects.get(id=payload["user_id"], is_active=True)

            # 3. Perform Atomic Rotation
            new_tokens = AuthEngine.refresh_tokens(user, payload, request)

            return ResponseFactory.success(
                message="Token rotation successful.",
                data={"access": new_tokens["access"], "refresh": new_tokens["refresh"]},
            )

        except CustomUser.DoesNotExist:
            return ResponseFactory.error(message="Subject user no longer exists.")
        except ValueError as e:
            return ResponseFactory.error(
                message=str(e), code=status.HTTP_401_UNAUTHORIZED
            )
