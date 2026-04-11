from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    The request is authenticated as a staff user, or is a read-only request.
    """

    def has_permission(self, request, _view):
        return bool(
            request.method in permissions.SAFE_METHODS
            or request.user
            and request.user.is_staff
        )


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Object-level permission to only allow owners of an object to edit it.
    Assumes the model instance has an `owner` attribute.
    """

    def has_object_permission(self, request, _view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.owner == request.user
