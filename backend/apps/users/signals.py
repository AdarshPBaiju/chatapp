from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from core.middleware.request_context import get_current_session_id
from users.services.auth_engine import AuthEngine

User = get_user_model()

@receiver(pre_save, sender=User)
def handle_password_change(sender, instance, **kwargs):
    """
    On password change, revoke all other sessions except the current one.
    """
    if not instance.pk:
        return

    try:
        old_instance = User.objects.get(pk=instance.pk)
        if old_instance.password != instance.password:
            # Password has changed
            current_sid = get_current_session_id()
            AuthEngine.revoke_all_sessions(
                user_id=str(instance.id),
                exclude_session_id=current_sid
            )
    except User.DoesNotExist:
        pass
