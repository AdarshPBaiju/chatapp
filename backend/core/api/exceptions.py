import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.views import exception_handler

from core.api.responses import ResponseFactory

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """
    Advanced exception handler utilizing ResponseFactory for 100% consistent API output.
    Catches Django and DRF exceptions and transforms them into a professional schema.
    """
    if isinstance(exc, DjangoValidationError):
        try:
            errors = exc.message_dict
        except AttributeError:
            errors = {"detail": str(exc)}

        return ResponseFactory.error(
            message="Validation Error", errors=errors, code=status.HTTP_400_BAD_REQUEST
        )

    response = exception_handler(exc, context)

    if response is not None:
        message = response.data.get("detail", "An error occurred.")
        errors = response.data

        standard_response = ResponseFactory.error(
            message=message, errors=errors, code=response.status_code
        )
        response.data = standard_response.data
    else:
        logger.exception("In-flight API Error Traceback: %s", exc)
        return ResponseFactory.error(
            message="Internal Server Error", code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return response
