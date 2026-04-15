from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import CustomUser
from .models.clients.client import Client


@admin.register(CustomUser)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for the CustomUser model."""

    list_display = (
        "email",
        "user_type",
        "is_staff",
        "is_active",
    )
    list_filter = ("user_type", "is_staff", "is_superuser", "is_active")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
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
    search_fields = ("email",)
    ordering = ("email",)
    filter_horizontal = (
        "groups",
        "user_permissions",
    )


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """Admin configuration for the Client model."""

    list_display = (
        "user",
        "full_name",
        "gender",
        "phone_number",
        "is_two_factor_enabled",
    )
    list_filter = (
        "gender",
        "is_two_factor_enabled",
    )
    search_fields = (
        "user__email",
        "full_name",
        "phone_number",
    )
    ordering = ("user",)
