import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

def api_exception_handler(exc, context):
    """
    Custom exception handler for Django Rest Framework that returns a
    consistent JSON format for all errors.
    """
    response = exception_handler(exc, context)

    if response is not None:
        custom_data = {
            "status": "error",
            "message": response.data.get("detail", "An error occurred."),
            "errors": response.data if isinstance(response.data, dict) and "detail" not in response.data else None,
            "code": response.status_code
        }
        response.data = custom_data
    else:
        logger.error("Unhandled Exception: %s", exc, exc_info=True)
        return Response({
            "status": "error",
            "message": "Internal Server Error",
            "code": 500
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
