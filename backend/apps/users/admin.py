from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import CustomUser


@admin.register(CustomUser)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for the CustomUser model."""

    list_display = (
        "phone_number",
        "user_type",
        "is_staff",
        "is_active",
    )
    list_filter = ("user_type", "is_staff", "is_superuser", "is_active")
    fieldsets = (
        (None, {"fields": ("phone_number", "password")}),
        (
            "Personal info",
            {"fields": ("user_type",)},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login",)}),
    )
    search_fields = ("phone_number",)
    ordering = ("phone_number",)
    filter_horizontal = (
        "groups",
        "user_permissions",
    )
