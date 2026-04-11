from __future__ import annotations

from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from core.api.permissions import AllowRevokeOnly
from users.api.v1.client.serializers.auth import ClientSessionRevokeSerializer
from users.services.auth_engine import AuthEngine


class ClientSessionListAPIView(APIView):
    permission_classes = [AllowRevokeOnly]

    @extend_schema(tags=["Client Security"])
    def get(self, request):
        """
        Retrieves active sessions for the authenticated user.
        Allowed for both full and restricted tokens.
        """
        user_id = str(request.user.id)
        data = AuthEngine.list_active_sessions(
            user_id=user_id,
            current_sid=request.auth.get("sid"),
        )

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
        revoked = AuthEngine.revoke_session(
            user_id=user_id,
            session_id=str(target_sid) if target_sid else None,
            access_jti=target_jti,
        )
        if not revoked:
            return ResponseFactory.error(message="Session not found or already expired.")

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
