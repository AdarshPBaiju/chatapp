import os

# Default to dev if not set
env = os.environ.get("DJANGO_ENV", "development")

if env == "production":
    from .prod import *  # noqa: F403
elif env == "development":
    from .dev import *  # noqa: F403
else:
    from .base import *  # noqa: F403
