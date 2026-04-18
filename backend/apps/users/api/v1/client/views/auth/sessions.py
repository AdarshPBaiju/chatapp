from __future__ import annotations

from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.api.responses import ResponseFactory
from core.api.permissions import AllowRevokeOnly
from core.auth.request_context import build_auth_request_context
from users.api.v1.client.serializers.auth import ClientSessionRevokeSerializer
from users.services.auth_engine import AuthEngine


def _build_restricted_payload(*, user_id: str, request, context, session_id: str | None):
    restricted_tokens = AuthEngine._build_restricted_response(
        user_id=user_id,
        context=context,
        access_jti=request.auth["jti"],
        refresh_jti=request.auth["partner_jti"],
        session_id=str(session_id or request.auth.get("sid") or ""),
    )
    return {
        "is_restricted": True,
        "access": restricted_tokens["access"],
        "refresh": restricted_tokens["refresh"],
        "access_exp": restricted_tokens["access_exp"],
        "refresh_exp": restricted_tokens["refresh_exp"],
        "sessions": restricted_tokens["active_sessions"],
    }


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

        if request.auth.get("scope") == "revoke_only":
            try:
                res = AuthEngine.promote_restricted_session(
                    user_id=user_id,
                    access_jti=request.auth["jti"],
                    refresh_jti=request.auth["partner_jti"],
                    session_id=current_sid,
                    request=request,
                )
                return ResponseFactory.success(
                    message="Active sessions retrieved successfully.",
                    data={
                        "sessions": sessions,
                        "is_promoted": True,
                        "access": res["access"],
                        "refresh": res["refresh"],
                        "access_exp": res["access_exp"],
                        "refresh_exp": res["refresh_exp"],
                    },
                )
            except ValueError:
                return ResponseFactory.success(
                    message="Active sessions retrieved successfully.",
                    data=_build_restricted_payload(
                        user_id=user_id,
                        request=request,
                        context=context,
                        session_id=current_sid,
                    ),
                )

        return ResponseFactory.success(
            message="Active sessions retrieved successfully.",
            data={
                "sessions": sessions,
                "is_promoted": False,
                "is_restricted": False,
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
            except ValueError:
                return ResponseFactory.success(
                    message="Session revoked. Device limit is still reached.",
                    data=_build_restricted_payload(
                        user_id=user_id,
                        request=request,
                        context=context,
                        session_id=request.auth.get("sid"),
                    ),
                )
            return ResponseFactory.success(
                message="Session revoked. You have been granted full access.",
                data={
                    "is_promoted": True,
                    "access": res["access"],
                    "refresh": res["refresh"],
                    "access_exp": res["access_exp"],
                    "refresh_exp": res["refresh_exp"],
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
            except ValueError:
                context = build_auth_request_context(request)
                return ResponseFactory.success(
                    message=f"Successfully revoked {count} other sessions. Device limit is still reached.",
                    data={
                        **_build_restricted_payload(
                            user_id=user_id,
                            request=request,
                            context=context,
                            session_id=request.auth.get("sid"),
                        ),
                        "revoked_count": count,
                    },
                )
            return ResponseFactory.success(
                message=f"Successfully revoked {count} other sessions. You have been granted full access.",
                data={
                    "is_promoted": True,
                    "access": res["access"],
                    "refresh": res["refresh"],
                    "access_exp": res["access_exp"],
                    "refresh_exp": res["refresh_exp"],
                },
            )

        return ResponseFactory.success(
            message=f"Successfully revoked {count} other sessions.",
            data={"revoked_count": count},
        )
