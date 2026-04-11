from typing import ClassVar

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models.base import UUIDModel


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError(_("The Email field must be set"))
        email = self.normalize_email(email)
        user_type = extra_fields.pop("user_type", self.model.UserType.USER)
        user = self.model(email=email, user_type=user_type, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("user_type", self.model.UserType.STAFF)
        return self.create_user(email, password, **extra_fields)


class CustomUser(UUIDModel, AbstractBaseUser, PermissionsMixin):
    class UserType(models.TextChoices):
        USER = "user", "User"
        STAFF = "staff", "Staff"

    user_type = models.CharField(
        max_length=10,
        choices=UserType.choices,
        default=UserType.USER,
        db_index=True,
    )
    email = models.EmailField(_("email address"), unique=True)
    is_active = models.BooleanField(default=False, db_index=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["user_type"]

    def __str__(self):
        return f"{self.email} ({self.get_user_type_display()})"
