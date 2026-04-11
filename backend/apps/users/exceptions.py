from django.utils.translation import gettext_lazy as _


class UserError(Exception):
    """Base exception for user app."""


class PhoneNumberRequiredError(ValueError, UserError):
    """Raised when phone number is missing."""

    def __init__(self, message=_("The Phone Number must be set")):
        self.message = message
        super().__init__(self.message)


class InvalidPhoneNumberError(ValueError, UserError):
    """Raised when the provided phone number is invalid."""

    def __init__(self, message=_("Enter a valid international phone number.")):
        self.message = message
        super().__init__(self.message)


class InactiveSuspensionError(ValueError, UserError):
    """Raised when an operation is performed on an inactive suspension."""

    def __init__(self, message=_("Cannot perform this operation on a suspension that is not active.")):
        self.message = message
        super().__init__(self.message)
