import logging
from typing import Any

from django.conf import settings
from fido2.server import Fido2Server
from fido2.webauthn import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialRpEntity,
    PublicKeyCredentialUserEntity,
)

from authentication.identity.infrastructure.models import UserWebAuthnCredential

logger = logging.getLogger("core")


class WebAuthnService:
    @staticmethod
    def get_server() -> Fido2Server:
        rp = PublicKeyCredentialRpEntity(
            id=getattr(settings, "BRAND_DOMAIN", "localhost"),
            name=getattr(settings, "BRAND_NAME", "ChitChat"),
        )
        # Note: In production, origin must match the frontend URL exactly
        return Fido2Server(rp)

    @classmethod
    def begin_registration(cls, user: Any) -> dict[str, Any]:
        """
        Starts the WebAuthn registration process by generating options for the client.
        """
        server = cls.get_server()
        user_entity = PublicKeyCredentialUserEntity(
            id=str(user.id).encode(),
            name=user.email,
            display_name=getattr(user.client, "full_name", user.email),
        )

        # Get existing credentials to exclude
        credentials = UserWebAuthnCredential.objects.filter(user=user)
        exclude_credentials = [
            {"id": bytes(c.credential_id), "type": "public-key"} for c in credentials
        ]

        options, state = server.register_begin(
            user_entity,
            exclude_credentials,
            authenticator_selection=AuthenticatorSelectionCriteria(
                user_verification="preferred"
            ),
        )

        return {"options": dict(options), "state": state}

    @classmethod
    def complete_registration(
        cls, user: Any, state: dict[str, Any], response_data: dict[str, Any]
    ) -> UserWebAuthnCredential:
        """
        Finalizes WebAuthn registration, verifying the signature and saving the credential.
        """
        server = cls.get_server()
        auth_data = server.register_complete(state, response_data)

        return UserWebAuthnCredential.objects.create(
            user=user,
            credential_id=auth_data.credential_id,
            public_key=auth_data.public_key,
            sign_count=auth_data.sign_count,
        )

    @classmethod
    def begin_authentication(cls, user: Any) -> dict[str, Any]:
        """
        Starts the WebAuthn authentication process.
        """
        server = cls.get_server()
        credentials = UserWebAuthnCredential.objects.filter(user=user)
        if not credentials.exists():
            raise ValueError("No WebAuthn credentials registered for this user.")

        allow_credentials = [
            {"id": bytes(c.credential_id), "type": "public-key"} for c in credentials
        ]

        options, state = server.authenticate_begin(allow_credentials)
        return {"options": dict(options), "state": state}

    @classmethod
    def complete_authentication(
        cls, user: Any, state: dict[str, Any], response_data: dict[str, Any]
    ) -> bool:
        """
        Verifies a WebAuthn authentication signature.
        """
        server = cls.get_server()

        # Fetch the potential credential to check sign_count
        credential_id = bytes.fromhex(response_data["id"])
        db_credential = UserWebAuthnCredential.objects.filter(
            user=user, credential_id=credential_id
        ).first()

        if not db_credential:
            return False

        server.authenticate_complete(
            state,
            [
                {
                    "id": bytes(db_credential.credential_id),
                    "public_key": bytes(db_credential.public_key),
                    "sign_count": db_credential.sign_count,
                }
            ],
            response_data,
        )

        db_credential.sign_count += 1
        db_credential.save(update_fields=["sign_count"])

        return True
