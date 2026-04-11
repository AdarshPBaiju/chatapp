from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, UTC
from typing import Any

from django.conf import settings
from jwcrypto import jwe, jwk, jws
from jwcrypto.common import json_decode


class AuthCryptoEngine:
    """
    Advanced cryptographic engine providing asymmetric signing (EdDSA) and
    full payload encryption (JWE) for authentication tokens.
    """

    @staticmethod
    def _get_keys() -> tuple[jwk.JWK, jwk.JWK]:
        """
        Retrieves or generates the EdDSA keypair from settings.
        """
        seed = settings.SECRET_KEY.encode()
        key = jwk.JWK.generate(
            kty="OKP", crv="Ed25519", seed=hashlib.sha256(seed).digest()
        )
        return key, key

    @classmethod
    def encrypt_and_sign(cls, payload: dict[str, Any], ttl_seconds: int) -> str:
        """
        Performs a two-stage cryptographic protection: EdDSA + JWE.
        """
        now = datetime.now(UTC)
        payload["exp"] = int((now + timedelta(seconds=ttl_seconds)).timestamp())
        payload["iat"] = int(now.timestamp())

        key, _ = cls._get_keys()
        header = {"alg": "A128KW", "enc": "A128GCM"}
        jwetoken = jwe.JWE(
            json.dumps(payload).encode("utf-8"), json.dumps(header).encode("utf-8")
        )
        jwetoken.add_recipient(key)
        encrypted_payload = jwetoken.serialize()

        jwstoken = jws.JWS(encrypted_payload.encode("utf-8"))
        jwstoken.add_signature(key, None, json.dumps({"alg": "EdDSA"}))
        return jwstoken.serialize(compact=True)

    @classmethod
    def decrypt_and_verify(cls, token: str) -> dict[str, Any]:
        """
        Reverses the protection: Verifies signature, decrypts JWE, and validates expiry.
        """
        key, _ = cls._get_keys()

        try:
            jwstoken = jws.JWS()
            jwstoken.deserialize(token)
            jwstoken.verify(key)
            encrypted_payload = jwstoken.payload

            jwetoken = jwe.JWE()
            jwetoken.deserialize(encrypted_payload)
            jwetoken.decrypt(key)

            payload = json_decode(jwetoken.payload)
        except Exception as e:
            error_msg = "Invalid or tampered token protocol"
            raise ValueError(error_msg) from e

        if payload.get("exp", 0) < int(datetime.now(UTC).timestamp()):
            error_msg = "The authentication token has expired"
            raise ValueError(error_msg)

        return payload

    @staticmethod
    def generate_fingerprint(request: Any) -> str:
        """
        Generates a unique hardware/context fingerprint based on IP and User-Agent.
        """
        ip = request.META.get(
            "HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "0.0.0.0")
        )
        ua = request.META.get("HTTP_USER_AGENT", "unknown")
        payload = f"{ip}:{ua}".encode()
        return hashlib.sha256(payload).hexdigest()
