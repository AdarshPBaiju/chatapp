from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
import time

from core.api.responses import ResponseFactory
from users.models import CustomUser
from authentication.identity.application.services import (
    HitEngine,
    TokenRotateService,
    LoginService,
)
from authentication.security.application.services import (
    EmailOtpService,
    TotpService,
    OtpDeliveryService,
)
from authentication.sessions.application.services import SessionQueryService
from authentication.core.request_context import (
    get_device_entropy,
    generate_device_entropy,
    attach_device_entropy_cookie,
)
from authentication.core.token_validator import (
    TokenValidationError,
    RefreshTokenExpiredError,
    TokenRevokedError,
    SessionInactiveError,
    TokenTamperedError,
    validate_token_for_request,
)
from authentication.identity.infrastructure.serializers import (
    IdentityInitSerializer,
    IdentityChallengeSerializer,
    ClientLoginSerializer,
    ClientTokenVerifySerializer,
    ClientTokenRefreshSerializer,
)


class IdentityInitAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=IdentityInitSerializer, tags=["Hardened Auth"])
    def post(self, request):
        serializer = IdentityInitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].lower()
        user = CustomUser.objects.filter(email=email).first()

        if not user or not user.is_active:
            # Simulation of work and fake flow creation to prevent enumeration
            flow_data = HitEngine.create_fake_flow(email=email, request=request)
            return ResponseFactory.success(
                message="Identity verified. Please select a verification method.",
                data={
                    "status": "challenge_required",
                    "hit": flow_data["hit"],
                    "flow_id": flow_data["flow_id"],
                    "expected_step": 1,
                    "allowed_methods": ["password", "email_otp"],
                    "challenge_type": "password",
                },
            )

        entropy = get_device_entropy(request)
        new_entropy = None
        if not entropy:
            new_entropy = generate_device_entropy()
            request.META["HTTP_X_DEVICE_ENTROPY"] = new_entropy

        flow_data = HitEngine.create_initial_flow(user_id=str(user.id), request=request)

        allowed_methods = ["password", "email_otp"]
        if user.client.is_two_factor_enabled:
            allowed_methods.append("totp")

        response = ResponseFactory.success(
            message="Identity verified. Please select a verification method.",
            data={
                "status": "challenge_required",
                "hit": flow_data["hit"],
                "flow_id": flow_data["flow_id"],
                "expected_step": 1,
                "allowed_methods": allowed_methods,
                "challenge_type": "password",
            },
        )

        if new_entropy:
            response = attach_device_entropy_cookie(response, new_entropy)

        return response


class IdentityChallengeAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=IdentityChallengeSerializer, tags=["Hardened Auth"])
    def post(self, request):
        serializer = IdentityChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hit_token = serializer.validated_data["hit"]
        method = serializer.validated_data["method"]
        expected_step = serializer.validated_data["expected_step"]

        try:
            payload = HitEngine.verify_and_advance_hit(
                hit_token=hit_token, request=request, expected_step=expected_step
            )
        except ValueError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_403_FORBIDDEN,
                error_code="IDENTITY_FLOW_EXPIRED",
            )

        # Handle fake flow rejection
        if payload.get("is_fake"):
            # Simulate work (e.g. hash verification time)
            time.sleep(0.1)
            HitEngine.increment_flow_failures(payload["flow_id"])
            return ResponseFactory.error(
                message="Invalid credentials.",
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="IDENTITY_INVALID_CREDENTIALS",
            )

        user_id = payload["sub"]
        user = CustomUser.objects.get(id=user_id)

        try:
            if method == "password":
                pwd = serializer.validated_data.get("password")
                if not pwd or not user.check_password(pwd):
                    HitEngine.increment_flow_failures(payload["flow_id"])
                    return ResponseFactory.error(
                        message="Invalid credentials.",
                        error_code="IDENTITY_INVALID_CREDENTIALS",
                    )
                return self._resolve_or_step_up(
                    user, payload, request, "pwd", acr_target=1
                )

            elif method == "email_otp":
                code = serializer.validated_data.get("code")
                if not code:
                    OtpDeliveryService.send_stateless_otp(user, payload["flow_id"])
                    next_hit = HitEngine.issue_next_hit(
                        payload, amr_adds=[], target_acr=payload.get("acr", 1)
                    )
                    return ResponseFactory.success(
                        message="Verification code sent to your email.",
                        data={
                            "status": "challenge_required",
                            "hit": next_hit,
                            "flow_id": payload["flow_id"],
                            "expected_step": payload["step_counter"] + 1,
                            "allowed_methods": ["email_otp"],
                            "challenge_type": "mfa",
                        },
                    )

                if not EmailOtpService.verify_otp(user.email, payload["flow_id"], code):
                    HitEngine.increment_flow_failures(payload["flow_id"])
                    return ResponseFactory.error(
                        message="Invalid or expired verification code.",
                        error_code="IDENTITY_INVALID_CODE",
                    )
                return self._resolve_or_step_up(
                    user, payload, request, "otp", acr_target=2
                )

            elif method == "totp":
                code = serializer.validated_data.get("code")
                if not code or not TotpService.verify_totp(user.client, code):
                    HitEngine.increment_flow_failures(payload["flow_id"])
                    return ResponseFactory.error(
                        message="Invalid authenticator code.",
                        error_code="IDENTITY_INVALID_CODE",
                    )
                return self._resolve_or_step_up(
                    user, payload, request, "totp", acr_target=2
                )

            elif method == "backup_code":
                code = serializer.validated_data.get("code")
                if not code or not TotpService.verify_and_burn_backup_code(
                    user.client, code
                ):
                    HitEngine.increment_flow_failures(payload["flow_id"])
                    return ResponseFactory.error(
                        message="Invalid or already used backup code.",
                        error_code="IDENTITY_INVALID_CODE",
                    )
                return self._resolve_or_step_up(
                    user, payload, request, "backup", acr_target=2
                )

            else:
                return ResponseFactory.error(
                    message="Unsupported verification method.",
                    error_code="IDENTITY_METHOD_UNSUPPORTED",
                )

        except ValueError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_403_FORBIDDEN,
                error_code="IDENTITY_FLOW_EXPIRED",
            )

    def _resolve_or_step_up(self, user, payload, request, amr_tag, acr_target):
        is_2fa = user.client.is_two_factor_enabled
        current_amr = payload.get("amr", [])

        if (
            is_2fa
            and "totp" not in current_amr
            and "backup" not in current_amr
            and amr_tag not in {"totp", "backup"}
        ):
            next_hit = HitEngine.issue_next_hit(
                payload, [amr_tag], target_acr=acr_target
            )
            return ResponseFactory.success(
                message="Step-up authentication required.",
                data={
                    "status": "challenge_required",
                    "hit": next_hit,
                    "flow_id": payload["flow_id"],
                    "expected_step": payload["step_counter"] + 1,
                    "allowed_methods": ["totp", "backup_code"],
                    "challenge_type": "mfa",
                },
            )

        tokens = LoginService.issue_tokens(user, request)
        status_tag = tokens["status"]

        response_data = {
            "is_restricted": status_tag == "restricted",
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "access_exp": tokens["access_exp"],
            "refresh_exp": tokens["refresh_exp"],
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": getattr(user.client, "full_name", ""),
            },
        }

        if status_tag == "restricted":
            response_data["active_sessions"] = tokens.get("active_sessions", [])

        return ResponseFactory.success(
            message="Authentication successful."
            if status_tag == "full"
            else "Maximum device limit reached.",
            data=response_data,
        )


class ClientLoginAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=ClientLoginSerializer, tags=["Client Auth"])
    def post(self, request):
        serializer = ClientLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        session_type = serializer.validated_data.get("session_type", "client")

        user = CustomUser.objects.filter(email=email).first()
        if not user or not user.check_password(password):
            return ResponseFactory.error(
                message="Invalid email or password.",
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="AUTH_INVALID_CREDENTIALS",
            )

        if not user.is_active:
            OtpDeliveryService.send_otp(user, ignore_cooldown=True)
            return ResponseFactory.success(
                message="Account verification required. A new OTP has been sent.",
                data={
                    "status": "pending_verification",
                    "user_id": str(user.id),
                    "email": user.email,
                    "resend_interval": settings.OTP_RESEND_INTERVAL_SECONDS,
                },
            )

        existing_entropy = get_device_entropy(request)
        issued_entropy = existing_entropy or generate_device_entropy()
        request.META["HTTP_X_DEVICE_ENTROPY"] = issued_entropy

        result = LoginService.issue_tokens(user, request, session_type=session_type)

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
            message="Login successful."
            if result["status"] == "full"
            else result["message"],
            data=response_data,
        )
        if not existing_entropy:
            attach_device_entropy_cookie(response, issued_entropy)
        return response


class ClientTokenVerifyAPIView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=ClientTokenVerifySerializer, tags=["Client Auth"])
    def post(self, request):
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

    @extend_schema(request=ClientTokenRefreshSerializer, tags=["Client Auth"])
    def post(self, request):
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
                grace_period_sec=int(
                    SessionQueryService.ACTIVITY_GRACE_PERIOD.total_seconds()
                ),
            )

            user = CustomUser.objects.get(id=payload["user_id"], is_active=True)

            if not existing_entropy:
                request.META["HTTP_X_DEVICE_ENTROPY"] = generate_device_entropy()
            token_result = TokenRotateService.refresh_tokens(user, payload, request)

        except CustomUser.DoesNotExist:
            return ResponseFactory.error(
                message="Subject user no longer exists.",
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="AUTH_USER_NOT_FOUND",
            )
        except (
            RefreshTokenExpiredError,
            SessionInactiveError,
            TokenRevokedError,
            TokenTamperedError,
            TokenValidationError,
        ) as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code=getattr(e, "error_code", "AUTH_TOKEN_INVALID"),
            )
        except ValueError as e:
            return ResponseFactory.error(
                message=str(e),
                code=status.HTTP_401_UNAUTHORIZED,
                error_code="AUTH_SESSION_EXPIRED",
            )
        else:
            is_restricted = token_result.get("status") == "restricted"
            response_data = {
                "is_restricted": is_restricted,
                "access": token_result["access"],
                "refresh": token_result["refresh"],
                "access_exp": token_result["access_exp"],
                "refresh_exp": token_result["refresh_exp"],
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": getattr(user.client, "full_name", ""),
                },
            }
            if is_restricted:
                response_data["active_sessions"] = token_result.get(
                    "active_sessions", []
                )

            response = ResponseFactory.success(
                message="Token rotation successful.",
                data=response_data,
            )
            if not existing_entropy:
                attach_device_entropy_cookie(
                    response, request.META["HTTP_X_DEVICE_ENTROPY"]
                )
            return response
