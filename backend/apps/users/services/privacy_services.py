from __future__ import annotations

from typing import TYPE_CHECKING
from django.core.exceptions import ValidationError

if TYPE_CHECKING:
    from users.models import Client


class PrivacyService:
    @staticmethod
    def can_add_to_group(inviter: Client, invitee: Client) -> bool:
        """
        Checks if the inviter is allowed to add the invitee to a group
        based on the invitee's Invitation Sovereignty policy.
        """
        policy = invitee.who_can_add_me
        
        if policy == "everyone":
            return True
            
        if policy == "request":
            # In a real system, this might return False here and trigger a request flow
            return False
            
        if policy == "contacts":
            # TODO: Implement contact/friendship check logic
            # For now, we'll assume it returns False unless they are explicitly connected
            return False
            
        return True

    @staticmethod
    def ensure_can_add_to_group(inviter: Client, invitee: Client) -> None:
        """
        Raises a ValidationError if the inviter cannot add the invitee.
        """
        if not PrivacyService.can_add_to_group(inviter, invitee):
            raise ValidationError(
                f"You cannot add {invitee.full_name} to this group due to their privacy settings."
            )
