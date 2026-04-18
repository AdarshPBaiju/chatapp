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
from core.auth.token_validator import (
    TokenValidationError,
    RefreshTokenExpiredError,
    TokenRevokedError,
    SessionInactiveError,
    TokenTamperedError,
    validate_token_for_request,
)
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
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=e.error_code,
            )


class ClientTokenRefreshAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=ClientTokenRefreshSerializer,
        tags=["Client Auth"],
    )
    def post(self, request):
        """
        Predictive Token Rotation API.
        Validates the refresh token and atomically swaps the session.
        Returns access_exp and refresh_exp so the client can schedule
        its next refresh without ever needing to decode the encrypted token.
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
                grace_period_sec=int(AuthEngine.ACTIVITY_GRACE_PERIOD.total_seconds()),
            )
            user = CustomUser.objects.get(id=payload["user_id"], is_active=True)

            if not existing_entropy:
                request.META["HTTP_X_DEVICE_ENTROPY"] = generate_device_entropy()
            token_result = AuthEngine.refresh_tokens(user, payload, request)

        except CustomUser.DoesNotExist:
            return ResponseFactory.error(
                message="Subject user no longer exists.",
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="AUTH_USER_NOT_FOUND",
            )
        except (RefreshTokenExpiredError, SessionInactiveError) as e:
            # Hard stop — refresh token itself is dead or session revoked.
            # Frontend must transition to LOGGED_OUT without any network call.
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=e.error_code,
            )
        except TokenRevokedError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=e.error_code,
            )
        except TokenTamperedError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=e.error_code,
            )
        except TokenValidationError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=e.error_code,
            )
        except ValueError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="AUTH_SESSION_EXPIRED",
            )
        else:
            if token_result["status"] == "restricted":
                response = ResponseFactory.success(
                    message="Session restricted: device limit exceeded.",
                    data={
                        "is_restricted": True,
                        "access": token_result["access"],
                        "refresh": token_result["refresh"],
                        "access_exp": token_result["access_exp"],
                        "refresh_exp": token_result["refresh_exp"],
                        "active_sessions": token_result["active_sessions"],
                        "user": token_result.get("user"),
                    },
                )
            else:
                response = ResponseFactory.success(
                    message="Token rotation successful.",
                    data={
                        "is_restricted": False,
                        "access": token_result["access"],
                        "refresh": token_result["refresh"],
                        "access_exp": token_result["access_exp"],
                        "refresh_exp": token_result["refresh_exp"],
                        "user": token_result.get("user"),
                    },
                )
            if not existing_entropy:
                attach_device_entropy_cookie(
                    response, request.META["HTTP_X_DEVICE_ENTROPY"]
                )
            return response
