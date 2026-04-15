from __future__ import annotations

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
from core.auth.token_validator import TokenValidationError, validate_token_for_request
from users.api.v1.client.serializers.auth import (
    ClientTokenVerifySerializer,
    ClientTokenRefreshSerializer,
)
from users.models import CustomUser
from users.services.auth_engine import AuthEngine


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
            payload = validate_token_for_request(request, token)

            return ResponseFactory.success(
                message="Token is valid and cryptographically secure.",
                data={"scope": payload.get("scope", "unknown")},
            )

        except TokenValidationError as e:
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
        existing_entropy = get_device_entropy(request)

        try:
            payload = validate_token_for_request(
                request,
                refresh_token,
                expected_type="refresh",
                check_session=True,
            )

            user = CustomUser.objects.get(id=payload["user_id"], is_active=True)

            if not existing_entropy:
                request.META["HTTP_X_DEVICE_ENTROPY"] = generate_device_entropy()
            token_result = AuthEngine.refresh_tokens(user, payload, request)

        except CustomUser.DoesNotExist:
            return ResponseFactory.error(message="Subject user no longer exists.")
        except TokenValidationError as e:
            return ResponseFactory.error(
                message=str(e), code=status.HTTP_401_UNAUTHORIZED
            )
        else:
            if token_result["status"] == "restricted":
                response = ResponseFactory.success(
                    message=token_result["message"],
                    data={
                        "is_restricted": True,
                        "access": token_result["access"],
                        "refresh": token_result["refresh"],
                        "active_sessions": token_result["active_sessions"],
                    },
                )
            else:
                response = ResponseFactory.success(
                    message="Token rotation successful.",
                    data={
                        "is_restricted": False,
                        "access": token_result["access"],
                        "refresh": token_result["refresh"],
                    },
                )
            if not existing_entropy:
                attach_device_entropy_cookie(
                    response, request.META["HTTP_X_DEVICE_ENTROPY"]
                )
            return response
