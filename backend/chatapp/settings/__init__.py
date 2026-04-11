import os

# Default to dev if not set
env = os.environ.get("DJANGO_ENV", "development")

if env == "production":
    from .prod import *
elif env == "development":
    from .dev import *
else:
    from .base import *
