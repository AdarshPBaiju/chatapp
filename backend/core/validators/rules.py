from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from decimal import Decimal, InvalidOperation
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError

from .base import AtomicValidator, ValidationContext, ValidationResponse

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.db import models


class RequiredRule(AtomicValidator):
    """
    Ensures that a field has a non-empty value.
    """

    code = "required"
    default_message = "This field is mandatory."

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Checks for None or empty whitespace strings.
        """
        if value is None or (isinstance(value, str) and not value.strip()):
            return self.get_error_message()
        return None


class EmailFormatRule(AtomicValidator):
    """
    Validates that a string conforms to a standard email format.
    """

    code = "invalid_email"
    default_message = "Enter a valid email address."

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Utilizes Django's core email validator.
        """
        if not value:
            return None
        try:
            validate_email(value)
        except DjangoValidationError:
            return self.get_error_message()
        return None


class MinMaxLengthRule(AtomicValidator):
    """
    Checks that the number of characters in a value is within specified bounds.
    """

    code = "length_violation"

    def __init__(
        self, min_len: int | None = None, max_len: int | None = None, **kwargs
    ):
        """
        Sets the minimum and maximum allowed length.
        """
        super().__init__(**kwargs)
        self.min = min_len
        self.max = max_len

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Evaluates length constraints on the string representation of the value.
        """
        if not value:
            return None
        length = len(str(value))
        if self.min and length < self.min:
            return (
                self.get_error_message({"count": self.min})
                or f"Min length is {self.min}."
            )
        if self.max and length > self.max:
            return (
                self.get_error_message({"count": self.max})
                or f"Max length is {self.max}."
            )
        return None


class NumericRangeRule(AtomicValidator):
    """
    Verfies that a numeric value falls within a given range.
    """

    code = "out_of_range"

    def __init__(
        self,
        min_val: float | Decimal | None = None,
        max_val: float | Decimal | None = None,
        **kwargs,
    ):
        """
        Sets the range boundaries.
        """
        super().__init__(**kwargs)
        self.min = min_val
        self.max = max_val

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Converts to Decimal for high-precision comparison.
        """
        if value is None:
            return None
        try:
            num = Decimal(str(value))
            if self.min is not None and num < Decimal(str(self.min)):
                return (
                    self.get_error_message({"limit": self.min})
                    or f"Value must be >= {self.min}."
                )
            if self.max is not None and num > Decimal(str(self.max)):
                return (
                    self.get_error_message({"limit": self.max})
                    or f"Value must be <= {self.max}."
                )
        except (InvalidOperation, ValueError):
            return "Invalid numeric format."
        return None


class RegexRule(AtomicValidator):
    """
    Tests a value against a compiled regular expression pattern.
    """

    code = "regex_violation"

    def __init__(self, pattern: str, **kwargs):
        """
        Compiles the regex pattern for efficient repeated checks.
        """
        super().__init__(**kwargs)
        self.pattern = re.compile(pattern)

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Executes the regex match.
        """
        if not value:
            return None
        if not self.pattern.match(str(value)):
            return self.get_error_message()
        return None


class UniqueConstraintRule(AtomicValidator):
    """
    Triggers a database check to ensure value uniqueness for a specific model field.
    """

    code = "unique_violation"

    def __init__(
        self,
        model: type[models.Model],
        field_name: str | None = None,
        case_insensitive: bool = True,
        **kwargs,
    ):
        """
        Configures the target model and field for the uniqueness check.
        """
        super().__init__(**kwargs)
        self.model = model
        self.field_name = field_name
        self.case_insensitive = case_insensitive

    def validate(
        self, value: Any, context: ValidationContext
    ) -> ValidationResponse | None:
        """
        Returns a deferred check descriptor for optimized processing.
        """
        if not value:
            return None

        field = self.field_name or "id"

        return {
            "deferred": {
                "check_type": "unique_case_insensitive"
                if self.case_insensitive
                else "unique_exact",
                "model": self.model,
                "field": field,
                "value": value,
                "instance_id": getattr(context.instance, "pk", None),
                "message": self.get_error_message({"field": field}),
                "metadata": self.options,
            }
        }


class CompositeUniqueRule(AtomicValidator):
    """
    Checks if a combination of multiple fields is unique across a model's table.
    """

    code = "composite_unique_violation"

    def __init__(self, model: type[models.Model], fields: list[str], **kwargs):
        """
        Sets the collection of fields that form the unique constraint.
        """
        super().__init__(**kwargs)
        self.model = model
        self.fields = fields

    def validate(
        self, _value: Any, context: ValidationContext
    ) -> ValidationResponse | None:
        """
        Gathers field values from the context and queues a deferred check.
        """
        values = {f: context.get_value(f) for f in self.fields}
        if any(v is None for v in values.values()):
            return None

        return {
            "deferred": {
                "check_type": "unique_together",
                "model": self.model,
                "field": self.fields[0],
                "value": values,
                "instance_id": getattr(context.instance, "pk", None),
                "message": self.get_error_message(),
                "metadata": {"fields": self.fields},
            }
        }


class FunctionalRule(AtomicValidator):
    """
    Allows the use of custom function-based validation logic.
    """

    def __init__(
        self, validator_fn: Callable[[Any, ValidationContext], str | None], **kwargs
    ):
        """
        Wraps a custom validation callable.
        """
        super().__init__(**kwargs)
        self.fn = validator_fn

    def validate(self, value: Any, context: ValidationContext) -> str | None:
        """
        Delegates validation to the inner callable.
        """
        return self.fn(value, context)


class URLFormatRule(AtomicValidator):
    """
    Validates that a string format represents a valid URL.
    """

    code = "invalid_url"

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Uses an internal regex to verify the URL structure.
        """
        if not value:
            return None
        pattern = re.compile(r"^(https?://)?([\w\-]+\.)+[\w\-]+(/[\w\-./?%&=]*)?$")
        if not pattern.match(str(value)):
            return self.get_error_message() or "Invalid URL format."
        return None


class FileConstraintRule(AtomicValidator):
    """
    Imposes size and extension limitations on uploaded files.
    """

    code = "file_violation"

    def __init__(
        self, max_size_mb: float = 5, allowed_ext: list[str] | None = None, **kwargs
    ):
        """
        Defines file size limits and allowed extensions.
        """
        super().__init__(**kwargs)
        self.max_size = max_size_mb * 1024 * 1024
        self.ext = allowed_ext

    def validate(self, value: Any, _context: ValidationContext) -> str | None:
        """
        Inspects the uploaded file's metadata for compliance.
        """
        if not value or not hasattr(value, "size"):
            return None
        if value.size > self.max_size:
            return (
                self.get_error_message({"limit": self.max_size})
                or f"File exceeds {self.max_size / 1024 / 1024}MB."
            )
        if self.ext:
            ext = value.name.split(".")[-1].lower()
            if ext not in self.ext:
                return f"Unsupported extension. Allowed: {', '.join(self.ext)}"
        return None


class MatchingFieldRule(AtomicValidator):
    """
    Verfies that the value of the current field matches another field in the payload.
    Commonly used for password confirmation.
    """

    code = "mismatch"

    def __init__(self, target_field: str, **kwargs):
        """
        Sets the target field name to compare against.
        """
        super().__init__(**kwargs)
        self.target = target_field

    def validate(self, value: Any, context: ValidationContext) -> str | None:
        """
        Retrieves the target value from the context and performs an equality check.
        """
        target_value = context.get_value(self.target)
        if value != target_value:
            return (
                self.get_error_message({"target": self.target})
                or f"This value must match {self.target}."
            )
        return None
