from dataclasses import dataclass
from pathlib import Path
from string import Formatter
from typing import Any
import uuid

from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.text import slugify


@deconstructible
@dataclass
class UploadPathConfig:
    """Configuration for SmartUploadPath behaviour."""

    base_path: str = ""
    field_lookup: str = "pk"
    use_date_structure: bool = False
    filename_mode: str = "keep"
    public_default: str = "unknown"
    path_template: str | None = None


@deconstructible
class SmartUploadPath:
    """
    A custom upload path generator for Django models.

    Supports dynamic context such as date, time, year, month, day, filename,
    ext, and uuid. Also supports traversing instance attributes via dot notation
    in a template string.

    Example:
        upload_to = SmartUploadPath(
            UploadPathConfig(
                base_path="avatars",
                field_lookup="user.email",
                path_template="{year}/{month}/{user.username}/{filename}"
            )
        )
    """

    def __init__(self, config: UploadPathConfig) -> None:
        """
        Initialize the upload path generator.

        Args:
            config: UploadPathConfig instance with all path generation settings.
        """
        self.config = config

    def _resolve_lookup(self, instance: Any, lookup_str: str) -> str | None:
        """Traverse instance attributes using dot notation."""
        current_obj = instance
        try:
            for attr in lookup_str.split("."):
                current_obj = getattr(current_obj, attr)
                if current_obj is None:
                    return None
            return str(current_obj)
        except AttributeError:
            return None

    def __call__(self, instance: Any, filename: str) -> str:
        """Generate the upload path based on the configured rules."""
        ext = filename.split(".")[-1].lower()
        original_name = filename.rsplit(".", 1)[0]
        safe_name = slugify(original_name) or "file"
        new_uuid = uuid.uuid4()

        if self.config.filename_mode == "uuid":
            final_filename = f"{new_uuid}.{ext}"
        elif self.config.filename_mode == "prepend_uuid":
            final_filename = f"{new_uuid.hex[:8]}_{safe_name}.{ext}"
        else:
            final_filename = f"{safe_name}.{ext}"

        now = timezone.now()
        today = now.date()
        base_context = {
            "date": today,
            "time": now,
            "year": str(today.year),
            "month": str(today.month).zfill(2),
            "day": str(today.day).zfill(2),
            "filename": final_filename,
            "ext": ext,
            "uuid": str(new_uuid),
        }

        if self.config.path_template:
            result_segments = []
            formatter = Formatter()
            for literal_text, field_name, format_spec, _ in formatter.parse(
                self.config.path_template
            ):
                result_segments.append(literal_text)

                if field_name:
                    if field_name in base_context:
                        val = base_context[field_name]
                        val = format(val, format_spec) if format_spec else str(val)
                    else:
                        val = self._resolve_lookup(instance, field_name)
                        if val is None:
                            val = self.config.public_default
                        val = slugify(str(val)) or "unknown"
                    result_segments.append(val)

            return "".join(result_segments)

        path = Path(self.config.base_path) if self.config.base_path else Path()

        identifier = self._resolve_lookup(instance, self.config.field_lookup)
        if not identifier:
            identifier = self.config.public_default
        path = path / (slugify(identifier) or "unknown")

        if self.config.use_date_structure:
            path = (
                path
                / str(today.year)
                / str(today.month).zfill(2)
                / str(today.day).zfill(2)
            )

        path = path / final_filename

        return str(path)
