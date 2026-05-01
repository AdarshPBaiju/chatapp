from datetime import datetime
from django.conf import settings


def debug_print(message: str, prefix: str = "SYSTEM") -> None:
    """
    Advanced, styled diagnostic printer for development.
    Features: ANSI colors, timestamps, and production safety.
    """
    if settings.DEBUG:
        # High-contrast color palette
        COLOR_MAP = {
            "GO-AUTH": "\033[95m",  # Magenta
            "RISK": "\033[91m",  # Red
            "ENRICH": "\033[93m",  # Yellow
            "SUCCESS": "\033[92m",  # Green
            "FALLBACK": "\033[33m",  # Brown/Orange
            "SYSTEM": "\033[96m",  # Cyan
            "CELERY": "\033[94m",  # Blue
        }

        # Pick color based on prefix or default to Cyan
        COLOR = COLOR_MAP.get(prefix.upper(), "\033[96m")
        BOLD = "\033[1m"
        GRAY = "\033[90m"
        RESET = "\033[0m"

        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        icon = "🔌"  # High-speed connectivity icon

        # Using fixed-width padding for the prefix to ensure vertical alignment
        output = (
            f"{GRAY}[{timestamp}]{RESET} "
            f"{COLOR}{BOLD}{icon} {prefix:<10}:{RESET} "
            f"{message}"
        )
        print(output, flush=True)
