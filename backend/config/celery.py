import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

app = Celery("config")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()


from core.utils.debug import debug_print  # noqa: E402


@app.task(bind=True)
def debug_task(self):
    debug_print(f"Executing debug task: {self.request!r}", prefix="CELERY")
