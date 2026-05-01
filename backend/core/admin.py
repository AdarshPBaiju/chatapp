from django.contrib import admin
from .models import GlobalConfiguration


@admin.register(GlobalConfiguration)
class GlobalConfigurationAdmin(admin.ModelAdmin):
    list_display = ("key", "value", "updated_at")
    search_fields = ("key", "description")
    ordering = ("key",)

    def has_add_permission(self, request):
        # Optionally restrict adding new keys via admin if you want it to be strictly code-driven
        return super().has_add_permission(request)
