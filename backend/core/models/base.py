from typing import ClassVar
import uuid

from django.db import models
from django.utils import timezone


class UUIDModel(models.Model):
    """
    An abstract base class model that provides a UUID based id.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    def __str__(self) -> str:
        return f"{self.__class__.__name__}({self.id})"

    class Meta:
        abstract = True


class TimestampedModel(UUIDModel):
    """
    An abstract base class model that provides self-updating
    'created_at' and 'updated_at' fields.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering: ClassVar[list[str]] = ["-created_at"]


class SoftDeleteModel(TimestampedModel):
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save()

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.save()
