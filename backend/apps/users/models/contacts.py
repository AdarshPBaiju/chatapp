from django.db import models
from core.models.base import UUIDModel
from typing import ClassVar


class Contact(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        BLOCKED = "blocked", "Blocked"

    owner = models.ForeignKey(
        "users.Client",
        on_delete=models.CASCADE,
        related_name="contacts",
        help_text="The user who owns this contact entry.",
    )
    contact_user = models.ForeignKey(
        "users.Client",
        on_delete=models.CASCADE,
        related_name="contacted_by",
        help_text="The user being added as a contact.",
    )
    
    nickname = models.CharField(
        max_length=255, 
        blank=True, 
        help_text="Custom name given to this contact by the owner."
    )
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Contact"
        verbose_name_plural = "Contacts"
        unique_together = ("owner", "contact_user")
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["contact_user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.owner.full_name} -> {self.contact_user.full_name} ({self.status})"
