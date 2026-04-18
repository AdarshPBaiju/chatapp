from __future__ import annotations
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from users.models import CustomUser
from users.services.auth_hit_engine import HitEngine
from users.services.auth_otp_engine import AuthOtpEngine
from users.services.auth_engine import AuthEngine
from users.services.user_services import UserService
from core.auth.request_context import (
    get_device_entropy,
    generate_device_entropy,
    attach_device_entropy_cookie,
)

from users.api.v1.client.serializers.auth.identity import (
    IdentityInitSerializer,
    IdentityChallengeSerializer,
)


class IdentityInitAPIView(APIView):
    """
    Step 1: Identity Discovery & Risk Assessment.
    Starts the flow and determines which authentication paths are available.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=IdentityInitSerializer, tags=["Hardened Auth"])
    def post(self, request):
        serializer = IdentityInitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].lower()
        user = CustomUser.objects.filter(email=email).first()

        if not user:
            return ResponseFactory.error(
                message="No account associated with this email address.",
                code=status.HTTP_404_NOT_FOUND,
                error_code="IDENTITY_USER_NOT_FOUND",
            )

        if not user.is_active:
            return ResponseFactory.error(
                message="Account verification required. Please check your email.",
                data={"status": "pending_verification", "email": user.email},
                error_code="IDENTITY_USER_INACTIVE",
            )

        entropy = get_device_entropy(request)
        new_entropy = None
        if not entropy:
            new_entropy = generate_device_entropy()
            # We must monkeypatch the request meta so HitEngine sees the new entropy
            # for the dev_hash calculation in this same request.
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
                "challenge_type": "select",
            },
        )

        if new_entropy:
            response = attach_device_entropy_cookie(response, new_entropy)

        return response


class IdentityChallengeAPIView(APIView):
    """
    Step 2/3: Challenge Resolution.
    Verifies the provided credential (Password/OTP/etc) and either issues tokens
    or demands further Step-Up verification.
    """

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
                    UserService.send_stateless_otp(user, payload["flow_id"])

                    # Issue a new HIT for the CURRENT step so they can use it for verification.
                    # This prevents JTI reuse/replay errors.
                    next_hit = HitEngine.issue_next_hit(
                        payload, amr_adds=[], target_acr=payload.get("acr", 1)
                    )

                    return ResponseFactory.success(
                        message="Verification code sent to your email.",
                        data={
                            "status": "challenge_required",
                            "hit": next_hit,
                            "expected_step": payload["step_counter"] + 1,
                            "allowed_methods": ["email_otp"],
                            "challenge_type": "mfa",
                        },
                    )

                if not AuthOtpEngine.verify_email_otp(
                    user.email, payload["flow_id"], code
                ):
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
                if not code or not AuthOtpEngine.verify_totp(user.client, code):
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
                if not code or not AuthOtpEngine.verify_and_burn_backup_code(
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
        """
        Calculates if the current flow has reached the required Assurance Level (ACR).
        """
        is_2fa = user.client.is_two_factor_enabled
        current_amr = payload.get("amr", [])

        if is_2fa and "totp" not in current_amr and amr_tag != "totp":
            next_hit = HitEngine.issue_next_hit(
                payload, [amr_tag], target_acr=acr_target
            )
            return ResponseFactory.success(
                message="Step-up authentication required.",
                data={
                    "status": "challenge_required",
                    "hit": next_hit,
                    "expected_step": payload["step_counter"] + 1,
                    "allowed_methods": ["totp", "backup_code"],
                    "challenge_type": "mfa",
                },
            )

        tokens = AuthEngine.issue_tokens(user, request)
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
            message="Authentication successful." if status_tag == "full" else "Maximum device limit reached. Please manage your sessions.",
            data=response_data,
        )
