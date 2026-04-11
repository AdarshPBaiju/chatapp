from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypedDict, TYPE_CHECKING
from dataclasses import dataclass, field as dc_field

if TYPE_CHECKING:
    from django.db import models


class DeferredExecutionDescriptor(TypedDict):
    """
    Describes a validation check that is queued for later execution to optimize database performance.
    """

    check_type: str
    model: type[models.Model]
    field: str
    value: Any
    instance_id: Any | None
    message: str | None
    metadata: dict[str, Any]


class ValidationResponse(TypedDict, total=False):
    """
    Represents a rich, structured response from a validation rule.
    """

    messages: list[str]
    severity: str
    code: str
    deferred: DeferredExecutionDescriptor | None


class ValidationContext:
    """
    Provides access to the full data payload and state during the validation process.
    """

    def __init__(
        self,
        payload: dict[str, Any],
        instance: models.Model | None = None,
        partial: bool = False,
        extra: dict[str, Any] | None = None,
    ):
        """
        Initializes the validation context.
        """
        self.payload = payload
        self.instance = instance
        self.partial = partial
        self.meta = extra or {}
        self._cache: dict[str, Any] = {}

    def get_value(self, path: str) -> Any:
        """
        Retrieves a value from the payload using dot-notation.
        """
        keys = path.split(".")
        current = self.payload
        for key in keys:
            if isinstance(current, dict):
                current = current.get(key)
                if current is None:
                    return None
            else:
                return None
        return current


class AtomicValidator(ABC):
    """
    Base class for individual validation rules.
    """

    code: str = "validation_failure"
    default_message: str = "Invalid value provided."

    def __init__(self, message: str | None = None, **kwargs):
        """
        Initializes the validator with an optional custom message and additional options.
        """
        self.custom_message = message
        self.options = kwargs

    @abstractmethod
    def validate(
        self, value: Any, context: ValidationContext
    ) -> None | str | list[str] | ValidationResponse:
        """
        Core validation logic to be implemented by child classes.
        """

    def get_error_message(self, params: dict[str, Any] | None = None) -> str:
        """
        Formats and returns the relevant error message.
        """
        msg = self.custom_message or self.default_message
        if params:
            try:
                return msg.format(**params)
            except (KeyError, ValueError):
                pass
        return msg


@dataclass
class ValidationSchema:
    """
    Configuration for fieldnd level verification requirements.
    """

    required: bool = True
    rules: list[AtomicValidator] = dc_field(default_factory=list)
    allow_null: bool = False
    allow_blank: bool = False
    dependencies: list[str] = dc_field(default_factory=list)
