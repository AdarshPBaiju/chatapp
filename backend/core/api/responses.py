from __future__ import annotations

from typing import Any
from datetime import datetime
from rest_framework import status
from rest_framework.response import Response


class ResponseFactory:
    """
    Advanced factory for constructing professional, standardized API responses.
    Ensures that every successful or failed response follows a strict, predictable schema.
    """

    @staticmethod
    def _base_response(  # noqa: PLR0913
        success: bool,
        message: str,
        data: Any = None,
        errors: Any = None,
        code: int = status.HTTP_200_OK,
        meta: dict[str, Any] | None = None,
    ) -> Response:
        """
        Internal generator for the standardized response structure.
        """
        response_payload = {
            "success": success,
            "message": message,
            "code": code,
            "data": data,
            "errors": errors,
            "meta": {
                "timestamp": datetime.now().isoformat(),
                **(meta or {}),
            },
        }
        return Response(response_payload, status=code)

    @classmethod
    def success(
        cls,
        message: str = "Success",
        data: Any = None,
        code: int = status.HTTP_200_OK,
        meta: dict[str, Any] | None = None,
    ) -> Response:
        """
        Constructs a standard success response.
        """
        return cls._base_response(
            success=True, message=message, data=data, code=code, meta=meta
        )

    @classmethod
    def error(
        cls,
        message: str = "Error",
        errors: Any = None,
        code: int = status.HTTP_400_BAD_REQUEST,
        meta: dict[str, Any] | None = None,
    ) -> Response:
        """
        Constructs a standard error response.
        """
        return cls._base_response(
            success=False, message=message, errors=errors, code=code, meta=meta
        )

    @classmethod
    def created(
        cls,
        message: str = "Created",
        data: Any = None,
        meta: dict[str, Any] | None = None,
    ) -> Response:
        """
        Shorthand for a 201 Created response.
        """
        return cls.success(
            message=message, data=data, code=status.HTTP_201_CREATED, meta=meta
        )
