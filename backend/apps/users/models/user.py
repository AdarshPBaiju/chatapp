import re
from typing import ClassVar

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
import phonenumbers

from apps.users.exceptions import (
    InvalidPhoneNumberError,
    PhoneNumberRequiredError,
)
from core.models.base import UUIDModel


class UserManager(BaseUserManager):
    def normalize_username(self, username):
        if username is None:
            return username

        username = str(username).strip()
        username = re.sub(r"[\s\-().]", "", username)
        if username.startswith("00"):
            username = "+" + username[2:]

        try:
            number = phonenumbers.parse(username, None)
        except phonenumbers.NumberParseException as exc:
            raise InvalidPhoneNumberError from exc

        if not phonenumbers.is_valid_number(number):
            raise InvalidPhoneNumberError

        return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)

    def create_user(self, phone_number, password=None, **extra_fields):
        if not phone_number:
            raise PhoneNumberRequiredError
        phone_number = self.normalize_username(phone_number)
        user = self.model(phone_number=phone_number, **extra_fields)
        user.set_password(password)
        user.user_type = self.model.UserType.USER
        user.save(using=self._db)
        return user

    def create_superuser(self, phone_number, password, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("user_type", self.model.UserType.STAFF)
        return self.create_user(phone_number, password, **extra_fields)


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
    phone_number = models.CharField(max_length=16, unique=True)
    is_active = models.BooleanField(default=False, db_index=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["user_type"]

    def __str__(self):
        return f"{self.phone_number} ({self.get_user_type_display()})"
