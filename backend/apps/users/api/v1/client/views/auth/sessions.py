from __future__ import annotations

from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from core.api.permissions import AllowRevokeOnly
from core.auth.request_context import build_auth_request_context
from users.api.v1.client.serializers.auth import ClientSessionRevokeSerializer
from users.services.auth_engine import AuthEngine


class ClientSessionListAPIView(APIView):
    permission_classes = [AllowRevokeOnly]

    @extend_schema(tags=["Client Security"])
    def get(self, request):
        """
        Retrieves active sessions for the authenticated user.
        If the user is currently using a restricted token but the session limit
        is no longer exceeded (e.g., config changed), this triggers auto-promotion.
        """
        user_id = str(request.user.id)
        current_sid = request.auth.get("sid")
        context = build_auth_request_context(request)

        sessions = AuthEngine.list_active_sessions(
            user_id=user_id,
            current_sid=current_sid,
            current_access_jti=request.auth.get("jti"),
            current_fingerprint=context.fingerprint,
            current_device_entropy=context.device_entropy,
        )

        promotion_data = None
        new_access_token = None

        if request.auth.get("scope") == "revoke_only":
            try:
                res = AuthEngine.promote_restricted_session(
                    user_id=user_id,
                    access_jti=request.auth["jti"],
                    refresh_jti=request.auth["partner_jti"],
                    session_id=current_sid,
                    request=request,
                )
                promotion_data = {
                    "is_promoted": True,
                    "access": res["access"],
                    "refresh": res["refresh"],
                }
            except ValueError:
                new_access_token = AuthEngine._create_token(
                    user_id=user_id,
                    jti=request.auth["jti"],
                    p_jti=request.auth["partner_jti"],
                    sid=current_sid,
                    fpt=context.fingerprint,
                    t_type="access",
                    scope="revoke_only",
                )

        return ResponseFactory.success(
            message="Active sessions retrieved successfully.",
            data={
                "sessions": sessions,
                "access": new_access_token,
                **(promotion_data or {}),
            },
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
            session_id=payload.get("sid"),
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

        target_jti = serializer.validated_data.get("access_jti")
        target_sid = serializer.validated_data.get("session_id")
        user_id = str(request.user.id)

        context = build_auth_request_context(request)
        current_session = AuthEngine.resolve_current_session(
            user_id=user_id,
            session_id=request.auth.get("sid"),
            access_jti=request.auth.get("jti"),
            fingerprint=context.fingerprint,
            device_entropy=context.device_entropy,
        )
        current_sid = str(current_session.session_id) if current_session else ""
        current_jti = current_session.access_jti if current_session else ""
        if (target_sid and str(target_sid) == current_sid) or (
            target_jti and target_jti == current_jti
        ):
            return ResponseFactory.error(
                message="Cannot revoke the current session from this action. Use logout instead."
            )

        revoked = AuthEngine.revoke_session(
            user_id=user_id,
            session_id=str(target_sid) if target_sid else None,
            access_jti=target_jti,
        )
        if not revoked:
            return ResponseFactory.error(
                message="Session not found or already expired."
            )

        if request.auth.get("scope") == "revoke_only":
            try:
                res = AuthEngine.promote_restricted_session(
                    user_id=user_id,
                    access_jti=request.auth["jti"],
                    refresh_jti=request.auth["partner_jti"],
                    session_id=request.auth.get("sid"),
                    request=request,
                )
            except ValueError as e:
                return ResponseFactory.error(message=str(e))
            return ResponseFactory.success(
                message="Session revoked. You have been granted full access.",
                data={
                    "is_promoted": True,
                    "access": res["access"],
                    "refresh": res["refresh"],
                },
            )

        return ResponseFactory.success(message="Remote session revoked successfully.")


class ClientSessionRevokeOthersAPIView(APIView):
    permission_classes = [AllowRevokeOnly]

    @extend_schema(tags=["Client Security"])
    def post(self, request):
        """
        Revokes all active sessions for the user except the current one.
        """
        user_id = str(request.user.id)
        current_sid = request.auth.get("sid")

        if not current_sid:
            return ResponseFactory.error(message="Current session identity not found.")

        count = AuthEngine.revoke_others(user_id, str(current_sid))

        if request.auth.get("scope") == "revoke_only":
            try:
                res = AuthEngine.promote_restricted_session(
                    user_id=user_id,
                    access_jti=request.auth["jti"],
                    refresh_jti=request.auth["partner_jti"],
                    session_id=request.auth.get("sid"),
                    request=request,
                )
            except ValueError as e:
                return ResponseFactory.error(message=str(e))
            return ResponseFactory.success(
                message=f"Successfully revoked {count} other sessions. You have been granted full access.",
                data={
                    "is_promoted": True,
                    "access": res["access"],
                    "refresh": res["refresh"],
                },
            )

        return ResponseFactory.success(
            message=f"Successfully revoked {count} other sessions.",
            data={"revoked_count": count},
        )
