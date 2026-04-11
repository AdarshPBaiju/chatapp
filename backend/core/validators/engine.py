from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from rest_framework import serializers

from .base import AtomicValidator, ValidationContext, ValidationSchema
from .dsl import RuleBuilder

logger = logging.getLogger(__name__)


class ValidationMixin:
    """
    Serializer mixin that orchestrates advanced cross-field validation rules and deferred checks.
    """

    field_specs: dict[str, ValidationSchema] = {}

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Entry point for the validation pipeline. Executes schema-based rules.
        """
        instance = getattr(self, "instance", None)
        partial = getattr(self, "partial", False)
        context = ValidationContext(
            data, instance=instance, partial=partial, extra=getattr(self, "context", {})
        )

        advanced_errors = self._run_schema_validation(data, context)

        if advanced_errors:
            raise serializers.ValidationError(advanced_errors)

        return data

    def _run_schema_validation(
        self, data: dict[str, Any], context: ValidationContext
    ) -> dict[str, list[str]]:
        """
        Processes individual field rules and collects deferred checks.
        """
        errors: dict[str, list[str]] = defaultdict(list)
        deferred_checks: list[dict[str, Any]] = []

        for field_name, spec in self.field_specs.items():
            schema = spec.build() if hasattr(spec, "build") else spec
            if context.partial and field_name not in data:
                continue

            val = data.get(field_name)

            if val is None:
                if not schema.allow_null:
                    errors[field_name].append(f"{field_name.title()} cannot be null.")
                continue

            if isinstance(val, str) and not val.strip():
                if not schema.allow_blank:
                    errors[field_name].append(f"{field_name.title()} cannot be blank.")
                continue

            for rule in schema.rules:
                try:
                    result = rule.validate(val, context)
                except Exception:
                    logger.exception("Rule crash in %s", rule.__class__.__name__)
                    errors[field_name].append("Internal validation error.")
                    continue

                if result is None:
                    continue

                if isinstance(result, dict) and "deferred" in result:
                    deferred_checks.append(result["deferred"])
                elif isinstance(result, list):
                    errors[field_name].extend(result)
                elif isinstance(result, str):
                    errors[field_name].append(result)
                elif hasattr(result, "messages"):
                    errors[field_name].extend(result["messages"])

        if deferred_checks:
            batch_results = self._resolve_deferred(deferred_checks)
            for f, msgs in batch_results.items():
                errors[f].extend(msgs)

        return dict(errors)

    def _resolve_deferred(self, checks: list[dict[str, Any]]) -> dict[str, list[str]]:
        """
        Executes database lookups for queued uniqueness checks.
        """
        batch_errors = defaultdict(list)

        for check in checks:
            ctype = check["check_type"]
            model = check["model"]
            field = check["field"]
            val = check["value"]
            orig_id = check["instance_id"]

            if ctype in ["unique_case_insensitive", "unique_exact"]:
                lookup = {
                    f"{field}__iexact" if "case_insensitive" in ctype else field: val
                }
                qs = model.objects.filter(**lookup)

                if extra_filters := check.get("metadata", {}):
                    qs = qs.filter(**extra_filters)

                if orig_id:
                    qs = qs.exclude(pk=orig_id)

                if qs.exists():
                    batch_errors[field].append(check["message"])

            elif ctype == "unique_together":
                qs = model.objects.filter(**val)
                if orig_id:
                    qs = qs.exclude(pk=orig_id)
                if qs.exists():
                    batch_errors[field].append(check["message"])

        return batch_errors


class ServiceValidator:
    """
    Stand-alone validation engine for use in the service layer outside of DRF serializers.
    """

    def run(self, data: dict[str, Any], schema: dict[str, list[AtomicValidator]]):
        """
        Executes a collection of validator rules against a data dictionary.
        """
        context = ValidationContext(data)
        errors = defaultdict(list)

        for field, rules in schema.items():
            val = data.get(field)
            for rule in rules:
                res = rule.validate(val, context)
                if res:
                    if isinstance(res, str):
                        errors[field].append(res)
                    elif isinstance(res, list):
                        errors[field].extend(res)

        if errors:
            raise serializers.ValidationError(errors)


class AutoValidationSerializer(serializers.Serializer, ValidationMixin):
    """
    Serializer that automatically detects RuleBuilders as class attributes.
    Generates DRF fields and populates field_specs in a single pass.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    @classmethod
    def _collect_field_specs(cls):
        """
        Dynamically extracts and configures fields defined via RuleBuilder.
        """
        if not hasattr(cls, "field_specs"):
            cls.field_specs = {}

        for attr_name in dir(cls):
            attr_val = getattr(cls, attr_name)
            if isinstance(attr_val, RuleBuilder):
                cls.field_specs[attr_name] = attr_val.build()
                setattr(cls, attr_name, attr_val.to_drf_field())


def auto_configure_fields(cls):
    """
    Decorator that resolves RuleBuilders into DRF fields before class initialization.
    Also ensures ValidationMixin is present for rule execution.
    """
    if not issubclass(cls, ValidationMixin):
        cls.__bases__ = (ValidationMixin, *cls.__bases__)

    specs = {}
    for attr_name, attr_val in list(cls.__dict__.items()):
        if isinstance(attr_val, RuleBuilder):
            specs[attr_name] = attr_val.build()
            setattr(cls, attr_name, attr_val.to_drf_field())

    cls.field_specs = {**getattr(cls, "field_specs", {}), **specs}
    return cls
