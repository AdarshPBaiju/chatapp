from django.core.management.base import BaseCommand
from core.models import GlobalConfiguration

class Command(BaseCommand):
    help = "Seed initial global configurations"

    def handle(self, *_args, **_options):
        # Max devices per user default = 2
        config, created = GlobalConfiguration.objects.get_or_create(
            key="max_devices_per_user",
            defaults={
                "value": 2,
                "description": "Maximum allowed active sessions per user"
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created config: {config.key}={config.value}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Config already exists: {config.key}={config.value}"))
