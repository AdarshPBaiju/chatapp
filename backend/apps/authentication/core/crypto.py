from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime, timedelta, UTC
from typing import Any

from django.conf import settings
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from jwcrypto import jwe, jwk, jws
from jwcrypto.common import json_decode

from authentication.core.request_context import (
    build_fingerprint,
    get_device_entropy,
    parse_device_info,
)


class AuthCryptoEngine:
    """
    Nested JOSE engine:
    - Inner JWS signed with EdDSA
    - Outer JWE encrypted with direct symmetric key (A256GCM)
    """

    @staticmethod
    def _active_kid() -> str:
        return settings.AUTH_ENGINE_SETTINGS["ACTIVE_KID"]

    @classmethod
    def _keyring(cls) -> dict[str, dict[str, str]]:
        keyring = settings.AUTH_ENGINE_SETTINGS.get("TOKEN_KEYRING", {})
        if not keyring:
            raise ValueError("Token keyring is not configured.")
        return keyring

    @classmethod
    def _material_for_kid(cls, kid: str) -> dict[str, str]:
        material = cls._keyring().get(kid)
        if not material:
            raise ValueError("Unknown token key id.")
        return material

    @classmethod
    def _signing_key(cls, kid: str) -> jwk.JWK:
        signing_seed = cls._material_for_kid(kid)["signing_seed"].encode("utf-8")
        derived_seed = hashlib.sha256(signing_seed).digest()
        private_key = Ed25519PrivateKey.from_private_bytes(derived_seed)
        private_raw = private_key.private_bytes(
            encoding=Encoding.Raw,
            format=PrivateFormat.Raw,
            encryption_algorithm=NoEncryption(),
        )
        public_raw = private_key.public_key().public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        d = base64.urlsafe_b64encode(private_raw).decode("utf-8").rstrip("=")
        x = base64.urlsafe_b64encode(public_raw).decode("utf-8").rstrip("=")
        return jwk.JWK(kty="OKP", crv="Ed25519", d=d, x=x)

    @classmethod
    def _encryption_key(cls, kid: str) -> jwk.JWK:
        enc_seed = cls._material_for_kid(kid)["encryption_key"].encode("utf-8")
        derived = hashlib.sha256(enc_seed).digest()
        encoded = base64.urlsafe_b64encode(derived).decode("utf-8").rstrip("=")
        return jwk.JWK(kty="oct", k=encoded)

    @classmethod
    def encrypt_and_sign(cls, payload: dict[str, Any], ttl_seconds: int) -> str:
        now = datetime.now(UTC)
        payload["exp"] = int((now + timedelta(seconds=ttl_seconds)).timestamp())
        payload["iat"] = int(now.timestamp())
        kid = cls._active_kid()

        sign_key = cls._signing_key(kid)
        signed = jws.JWS(json.dumps(payload).encode("utf-8"))
        signed.add_signature(
            sign_key,
            None,
            json.dumps({"alg": "EdDSA", "kid": kid, "typ": "JWT"}),
        )

        enc_key = cls._encryption_key(kid)
        encrypted = jwe.JWE(
            signed.serialize(compact=True).encode("utf-8"),
            json.dumps({"alg": "dir", "enc": "A256GCM", "kid": kid, "cty": "JWT"}),
        )
        encrypted.add_recipient(enc_key)
        return encrypted.serialize(compact=True)

    @classmethod
    def decrypt_and_verify(cls, token: str, grace_period_sec: int = 0) -> dict[str, Any]:
        try:
            jwetoken = jwe.JWE()
            jwetoken.deserialize(token)
            kid = jwetoken.jose_header.get("kid") or cls._active_kid()
            jwetoken.decrypt(cls._encryption_key(kid))
            signed_payload = jwetoken.payload.decode("utf-8")

            jwstoken = jws.JWS()
            jwstoken.deserialize(signed_payload)
            sign_kid = jwstoken.jose_header.get("kid") or kid
            jwstoken.verify(cls._signing_key(sign_kid))
            payload = json_decode(jwstoken.payload)
        except Exception as e:
            error_msg = "Invalid or tampered token protocol"
            raise ValueError(error_msg) from e

        if payload.get("exp", 0) + grace_period_sec < int(datetime.now(UTC).timestamp()):
            error_msg = "The authentication token has expired"
            raise ValueError(error_msg)

        return payload

    @staticmethod
    def parse_device_info(request: Any) -> str:
        return parse_device_info(request)

    @staticmethod
    def generate_fingerprint(request: Any) -> str:
        return build_fingerprint(request, device_entropy=get_device_entropy(request))
