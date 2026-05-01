from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any
from uuid import UUID

from rest_framework import serializers

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.db import models
    from django.db.models import Q, QuerySet

logger = logging.getLogger(__name__)


class FKResolverMixin:
    """
    Handles resolution of foreign key values into model instances across nested data structures.
    Supports request-lifecycle caching and polymorphic model mapping.
    """

    fk_field_mappings: dict[
        str, type[models.Model] | Callable[[Any], type[models.Model]]
    ] = {}
    fk_error_messages: dict[str, dict[str, str]] = {}
    fk_filters: dict[str, dict[str, Any]] = {}
    fk_exclude_filters: dict[str, dict[str, Any]] = {}
    fk_q_filters: dict[str, Q] = {}
    fk_allow_null: dict[str, bool] = {}
    fk_field_sources: dict[str, str] = {}
    fk_select_related: dict[str, list[str]] = {}
    fk_prefetch_related: dict[str, list[str]] = {}

    DEFAULT_ERROR_MESSAGES = {
        "not_found": "{field_name} not found with provided identity.",
        "multiple_found": "Multiple records found for {field_name}.",
        "required": "{field_name} is mandatory for this operation.",
        "invalid_type": "{field_name} identity format is invalid.",
    }

    def __init__(self, *args, **kwargs):
        """
        Initializes the resolver with a local lookup cache.
        """
        super().__init__(*args, **kwargs)
        self._fk_resolution_cache: dict[tuple[type[models.Model], Any], Any] = {}

    def _get_nested_val(self, data: dict[str, Any], path: str) -> Any:
        """
        Safely extracts a value from a nested dictionary using dot-notation.
        """
        keys = path.split(".")
        current = data
        for key in keys:
            if isinstance(current, dict):
                current = current.get(key)
                if current is None:
                    return None
            else:
                return None
        return current

    def _set_nested_val(self, data: dict[str, Any], path: str, value: Any):
        """
        Mutates a nested dictionary to set a value at a specified path.
        """
        keys = path.split(".")
        current = data
        for key in keys[:-1]:
            current = current.setdefault(key, {})
        current[keys[-1]] = value

    def _resolve_one(
        self, field_name: str, value: Any, context_data: dict[str, Any]
    ) -> Any:
        """
        Resolves a single field value to a model instance using configured mappings.
        """
        mapping = self.fk_field_mappings[field_name]
        model_class = mapping(context_data) if callable(mapping) else mapping

        if not value:
            if not self.fk_allow_null.get(field_name, True):
                raise serializers.ValidationError(
                    self._get_err_msg(field_name, "required")
                )
            return None

        if isinstance(value, model_class):
            return value

        cache_key = (model_class, value)
        if cache_key in self._fk_resolution_cache:
            return self._fk_resolution_cache[cache_key]

        qs = self._build_fk_qs(model_class, field_name)

        try:
            lookup_field = "id" if isinstance(value, str | UUID) else "pk"
            instance = qs.get(**{lookup_field: value})
        except model_class.DoesNotExist as exc:
            raise serializers.ValidationError(
                self._get_err_msg(field_name, "not_found")
            ) from exc
        except model_class.MultipleObjectsReturned as exc:
            raise serializers.ValidationError(
                self._get_err_msg(field_name, "multiple_found")
            ) from exc
        else:
            self._fk_resolution_cache[cache_key] = instance
            return instance

    def _build_fk_qs(self, model: type[models.Model], field: str) -> QuerySet:
        """
        Constructs an optimized queryset with relevant filters and performance hooks.
        """
        qs = model.objects.all()

        if select := self.fk_select_related.get(field):
            qs = qs.select_related(*select)
        if prefetch := self.fk_prefetch_related.get(field):
            qs = qs.prefetch_related(*prefetch)
        if q_filter := self.fk_q_filters.get(field):
            qs = qs.filter(q_filter)
        if filters := self.fk_filters.get(field):
            qs = qs.filter(**filters)
        if excludes := self.fk_exclude_filters.get(field):
            qs = qs.exclude(**excludes)

        return qs

    def _get_err_msg(self, field: str, error_type: str) -> str:
        """
        Retrieves a formatted error message for a specific failure type.
        """
        msg = self.fk_error_messages.get(field, {}).get(error_type)
        if msg:
            return msg

        base = self.DEFAULT_ERROR_MESSAGES.get(error_type, "Validation error.")
        return base.format(field_name=field.replace("_", " ").title())

    def resolve_foreign_keys(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Main entry point to resolve all configured foreign keys within a dataset.
        """
        errors = {}
        resolved_data = data.copy()

        for field_name in self.fk_field_mappings:
            source = self.fk_field_sources.get(field_name, field_name)
            val = self._get_nested_val(resolved_data, source)

            try:
                resolved_val = self._resolve_one(field_name, val, resolved_data)
                self._set_nested_val(resolved_data, source, resolved_val)
            except serializers.ValidationError as e:
                errors[field_name] = e.detail

        if errors:
            raise serializers.ValidationError(errors)

        return resolved_data

    def to_internal_value(self, data):
        """
        Ensures that any validation errors raised during conversion are properly structured.
        """
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError(exc.detail) from exc
