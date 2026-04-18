from __future__ import annotations

import hashlib
import uuid
import time
from typing import Any

from django.core.cache import cache

from core.auth.crypto import AuthCryptoEngine
from core.auth.request_context import get_device_entropy


import logging

logger = logging.getLogger("users")


class HitEngine:
    """
    Advanced Identity Provider Engine for continuous Risk-adaptive Verification.
    Manages Hardened Identity Tokens (HIT) and Lua-backed atomic state machines.
    """

    ATOMIC_HIT_VERIFY_LUA = """
    local flow_key = KEYS[1]
    local jti = ARGV[1]
    local expected_step = tonumber(ARGV[2])

    if redis.call('EXISTS', flow_key) == 0 then
        return 'EXPIRED_FLOW'
    end

    local is_used = redis.call('HGET', flow_key, 'used_jti:' .. jti)
    if is_used == '1' then
        redis.call('DEL', flow_key) -- IMMEDIATE BURN on replay attack
        return 'REPLAY_VIOLATION'
    end

    local current_step = tonumber(redis.call('HGET', flow_key, 'step'))
    if current_step ~= expected_step then
        return 'STEP_VIOLATION'
    end

    redis.call('HSET', flow_key, 'used_jti:' .. jti, '1')
    redis.call('HINCRBY', flow_key, 'step', 1)
    return 'SUCCESS'
    """

    @classmethod
    def generate_device_hash(cls, request: Any) -> str:
        entropy = get_device_entropy(request) or "unknown"
        user_agent = request.META.get("HTTP_USER_AGENT", "unknown")
        # Optional: Add server secret salt to dev hash calculation
        msg = f"{entropy}:{user_agent}".encode()
        return hashlib.sha256(msg).hexdigest()

    @classmethod
    def create_initial_flow(
        cls, user_id: str, request: Any, expected_step: int = 1
    ) -> dict[str, Any]:
        """
        Starts a new authentication flow from step 1 in Redis.
        Returns the initial HIT (JWE).
        """
        flow_id = str(uuid.uuid4())
        jti = str(uuid.uuid4())
        dev_hash = cls.generate_device_hash(request)

        # Initialize Redis Hash with an absolute 5-minute TTL
        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{flow_id}"

        # Pipelines for atomic setup
        pipe = redis_client.pipeline()
        pipe.hset(flow_key, "step", str(expected_step))
        pipe.hset(flow_key, "attempts", "0")
        pipe.expire(flow_key, 300)
        pipe.execute()

        payload = {
            "sub": str(user_id),
            "jti": jti,
            "flow_id": flow_id,
            "amr": [],
            "acr": 0,
            "step_counter": expected_step,
            "dev_hash": dev_hash,
            "type": "hit",
        }

        # 300 seconds TTL for the JWE token intrinsically
        hit_token = AuthCryptoEngine.encrypt_and_sign(payload, 300)

        return {
            "hit": hit_token,
            "flow_id": flow_id,
            "step_counter": expected_step,
        }

    @classmethod
    def verify_and_advance_hit(
        cls, hit_token: str, request: Any, expected_step: int
    ) -> dict[str, Any]:
        """
        Verifies the HIT token cryptographically, then executes the Atomic Lua verification.
        Returns the decrypted payload if entirely valid and progressed perfectly.
        Raises ValueError if anything mismatches or exploits are detected.
        """
        try:
            payload = AuthCryptoEngine.decrypt_and_verify(hit_token)
        except Exception as e:
            raise ValueError("Token compromised or expired.") from e

        if payload.get("type") != "hit":
            raise ValueError("Invalid token context.")

        inc_dev_hash = cls.generate_device_hash(request)
        if payload.get("dev_hash") != inc_dev_hash:
            raise ValueError("Device Context Interrupted. Login Reset.")

        # Atomic Flow advancement
        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{payload['flow_id']}"
        res = redis_client.eval(
            cls.ATOMIC_HIT_VERIFY_LUA, 1, flow_key, payload["jti"], expected_step
        )

        result_str = res.decode() if isinstance(res, bytes) else str(res)

        logger.debug(
            "HIT_VERIFY_RESULT: flow_id=%s, jti=%s, expected=%s, result=%s",
            payload["flow_id"],
            payload["jti"],
            expected_step,
            result_str,
        )

        if result_str == "EXPIRED_FLOW":
            raise ValueError("Authentication flow has timed out.")
        if result_str == "REPLAY_VIOLATION":
            raise ValueError("Token reuse detected. Flow destroyed.")
        if result_str == "STEP_VIOLATION":
            raise ValueError("Race condition or out-of-order execution detected.")

        if result_str != "SUCCESS":
            raise ValueError("Unknown gateway rejection.")

        return payload

    @classmethod
    def issue_next_hit(
        cls, previous_payload: dict[str, Any], amr_adds: list[str], target_acr: int
    ) -> str:
        """
        Generates the sequential next HIT for a step-up challenge.
        """
        jti = str(uuid.uuid4())

        amr_set = set(previous_payload.get("amr", []))
        amr_set.update(amr_adds)

        payload = {
            "sub": previous_payload["sub"],
            "jti": jti,
            "flow_id": previous_payload["flow_id"],
            "amr": list(amr_set),
            "acr": target_acr,
            "step_counter": previous_payload["step_counter"] + 1,
            "dev_hash": previous_payload["dev_hash"],
            "type": "hit",
        }

        # Issue for the remaining duration of the 5-minute master window
        elapsed = time.time() - previous_payload.get("iat", time.time())
        remaining_ttl = int(max(300 - elapsed, 30))

        return AuthCryptoEngine.encrypt_and_sign(payload, remaining_ttl)

    @classmethod
    def increment_flow_failures(cls, flow_id: str) -> None:
        """
        Increments failed attempt counters on a flow. Destroys flow natively if >= 5.
        """
        redis_client = cache.client.get_client()
        flow_key = f"auth:flow:{flow_id}"
        attempts = redis_client.hincrby(flow_key, "attempts", 1)
        if attempts >= 5:
            redis_client.delete(flow_key)
            raise ValueError("Flow locked due to excessive invalid iterations.")
