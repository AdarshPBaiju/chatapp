from __future__ import annotations

from typing import TYPE_CHECKING
from rest_framework import serializers
from .base import ValidationSchema
from .rules import (
    RequiredRule,
    EmailFormatRule,
    MinMaxLengthRule,
    UniqueConstraintRule,
    NumericRangeRule,
    RegexRule,
    MatchingFieldRule,
    URLFormatRule,
    FileConstraintRule,
)

if TYPE_CHECKING:
    from django.db import models


class RuleBuilder:
    """
    Fluent builder for creating field validation schemas and generating DRF fields.
    """

    def __init__(self, field_type: type[serializers.Field] = serializers.CharField):
        """
        Initializes the builder with a default field type.
        """
        self._rules = []
        self._required = True
        self._allow_null = False
        self._allow_blank = False
        self._field_type = field_type
        self._drf_kwargs = {}

    def optional(self) -> RuleBuilder:
        """Marks the field as optional and allows null/blank values."""
        self._required = False
        self._drf_kwargs["required"] = False
        return self.nullable(True, True)

    def nullable(self, null: bool = True, blank: bool = True) -> RuleBuilder:
        """Configures null and blank value acceptance for the field."""
        self._allow_null = null
        self._allow_blank = blank
        self._drf_kwargs["allow_null"] = null
        self._drf_kwargs["allow_blank"] = blank
        return self

    def access(self, read: bool | None = None, write: bool | None = None) -> RuleBuilder:
        """Configures the read_only and write_only status of the field."""
        if read is not None:
            self._drf_kwargs["read_only"] = read
        if write is not None:
            self._drf_kwargs["write_only"] = write
        return self

    def source(self, field_path: str) -> RuleBuilder:
        """Configures the source mapping for the DRF field (e.g., 'user.email')."""
        self._drf_kwargs["source"] = field_path
        return self

    def label(self, text: str) -> RuleBuilder:
        """Attaches a human-readable label to the DRF field."""
        self._drf_kwargs["label"] = text
        return self

    def help_text(self, text: str) -> RuleBuilder:
        """Attaches help text for API documentation."""
        self._drf_kwargs["help_text"] = text
        return self

    def choices(self, choices: list[tuple[str, str]]) -> RuleBuilder:
        """Converts to a ChoiceField with a predefined set of options."""
        self._field_type = serializers.ChoiceField
        self._drf_kwargs["choices"] = choices
        return self

    def required(self) -> RuleBuilder:
        """Core rule ensuring the field is provided and non-empty."""
        self._rules.append(RequiredRule())
        return self

    def email(self, message: str | None = None) -> RuleBuilder:
        """Validates format matches a standard email pattern."""
        self._field_type = serializers.EmailField
        self._rules.append(EmailFormatRule(message=message))
        return self

    def url(self, message: str | None = None) -> RuleBuilder:
        """Validates format matches a valid URL pattern."""
        self._field_type = serializers.URLField
        self._rules.append(URLFormatRule(message=message))
        return self

    def unique(
        self, model: type[models.Model], field: str | None = None
    ) -> RuleBuilder:
        """Queues a database check to ensure the value is globally unique."""
        self._rules.append(UniqueConstraintRule(model=model, field_name=field))
        return self

    def filter(self, **kwargs) -> RuleBuilder:
        """Adds scoped filters to the most recently added database rule."""
        if self._rules:
            last_rule = self._rules[-1]
            if isinstance(last_rule, UniqueConstraintRule):
                last_rule.options.update(kwargs)
        return self

    def min(self, value: float, message: str | None = None) -> RuleBuilder:
        """Applies minimum length or minimum numeric value constraints."""
        if issubclass(
            self._field_type, serializers.IntegerField | serializers.DecimalField
        ):
            self._rules.append(NumericRangeRule(min_val=value, message=message))
        else:
            self._rules.append(MinMaxLengthRule(min_len=int(value), message=message))
        return self

    def max(self, value: float, message: str | None = None) -> RuleBuilder:
        """Applies maximum length or maximum numeric value constraints."""
        if issubclass(
            self._field_type, serializers.IntegerField | serializers.DecimalField
        ):
            self._rules.append(NumericRangeRule(max_val=value, message=message))
        else:
            self._rules.append(MinMaxLengthRule(max_len=int(value), message=message))
        return self

    def matches(self, target_field: str) -> RuleBuilder:
        """Forces the current field value to match another field in the payload."""
        self._rules.append(MatchingFieldRule(target_field=target_field))
        return self

    def regex(self, pattern: str, message: str | None = None) -> RuleBuilder:
        """Validates the value against a custom regular expression."""
        self._rules.append(RegexRule(pattern=pattern, message=message))
        return self

    def file(self, max_mb: float = 5, exts: list[str] | None = None) -> RuleBuilder:
        """Sets field to FileField and applies size/extension validation."""
        self._field_type = serializers.FileField
        self._rules.append(FileConstraintRule(max_size_mb=max_mb, allowed_ext=exts))
        return self

    def to_drf_field(self) -> serializers.Field:
        """Compiles builder state into a standard Django REST Framework field."""
        kwargs = self._drf_kwargs.copy()

        if kwargs.get("read_only"):
            kwargs["required"] = False
        elif "required" not in kwargs:
            kwargs["required"] = self._required

        if "allow_blank" in kwargs and not issubclass(
            self._field_type, serializers.CharField
        ):
            kwargs.pop("allow_blank")
        return self._field_type(**kwargs)

    def build(self) -> ValidationSchema:
        """Compiles builder state into an advanced ValidationSchema."""
        return ValidationSchema(
            rules=self._rules,
            required=self._required,
            allow_null=self._allow_null,
            allow_blank=self._allow_blank,
        )


class V:
    """
    Global entry point for the Validation DSL.
    Provides a factory for creating chainable RuleBuilders.
    """

    def email(self, message: str | None = None) -> RuleBuilder:
        """Factory for Email fields."""
        return RuleBuilder(serializers.EmailField).required().email(message=message)

    def url(self, message: str | None = None) -> RuleBuilder:
        """Factory for URL fields."""
        return RuleBuilder(serializers.URLField).required().url(message=message)

    def string(self) -> RuleBuilder:
        """Factory for basic String fields."""
        return RuleBuilder(serializers.CharField).required()

    def integer(self) -> RuleBuilder:
        """Factory for Integer fields."""
        return RuleBuilder(serializers.IntegerField).required()

    def decimal(self) -> RuleBuilder:
        """Factory for Decimal fields."""
        return RuleBuilder(serializers.DecimalField).required()

    def boolean(self) -> RuleBuilder:
        """Factory for Boolean fields."""
        return RuleBuilder(serializers.BooleanField).required()

    def date(self) -> RuleBuilder:
        """Factory for Date fields."""
        return RuleBuilder(serializers.DateField).required()

    def datetime(self) -> RuleBuilder:
        """Factory for DateTime fields."""
        return RuleBuilder(serializers.DateTimeField).required()

    def uuid(self) -> RuleBuilder:
        """Factory for UUID fields."""
        return RuleBuilder(serializers.UUIDField).required()

    def password(self) -> RuleBuilder:
        """Factory for secure, write-only Password fields."""
        return RuleBuilder(serializers.CharField).required().access(write=True)

    def file(self, max_mb: float = 5, exts: list[str] | None = None) -> RuleBuilder:
        """Factory for File upload fields."""
        return RuleBuilder(serializers.FileField).required().file(max_mb=max_mb, exts=exts)

    def confirm_password(self, target: str = "password") -> RuleBuilder:
        """Shorthand for creating a password confirmation field."""
        return self.password().matches(target).label("Confirm Password")

    def choice(self, choices: list[tuple[str, str]]) -> RuleBuilder:
        """Factory for Choice (dropdown) fields."""
        return RuleBuilder().required().choices(choices)

    def required(self) -> RuleBuilder:
        """Basic mandatory RuleBuilder."""
        return RuleBuilder().required()


v = V()
