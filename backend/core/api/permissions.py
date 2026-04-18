from __future__ import annotations

from typing import Any

from rest_framework import permissions


class FullAccessRequired(permissions.BasePermission):
    """
    Standard permission class for business logic views.
    Only allows access if the token scope is 'full'.
    Denies access for 'revoke_only' (Temporary) tokens.
    """

    def has_permission(self, request: Any, _view: Any) -> bool:
        auth_data = getattr(request, "auth", {})
        if not auth_data:
            return False

        return auth_data.get("scope") == "full"


class AllowRevokeOnly(permissions.BasePermission):
    """
    Specialized permission for session management views.
    Allows access for both 'full' and 'revoke_only' tokens.
    """

    def has_permission(self, request: Any, _view: Any) -> bool:
        if request.method == "OPTIONS":
            return True

        auth_data = getattr(request, "auth", {})
        if not auth_data:
            return False

        scope = auth_data.get("scope")
        if scope is None:
            return bool(getattr(request.user, "is_authenticated", False))
        return scope in ["full", "revoke_only"]
