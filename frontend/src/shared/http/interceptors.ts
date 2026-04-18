/**
 * interceptors.ts
 *
 * Minimal, predictive-session-aware interceptors.
 *
 * The sessionEngine owns all refresh scheduling.
 * These interceptors do NOT attempt any refresh themselves.
 *
 * Request interceptor:  attach Authorization header.
 * Response interceptor: map error_code to deterministic local state transitions.
 */

import { AxiosError, InternalAxiosRequestConfig } from "axios";

import { getTimezoneOffsetHeaderValue } from "@/shared/lib/timezone";
import { tokenManager } from "@/shared/auth/tokenManager";
import { sessionEngine } from "@/shared/auth/sessionEngine";

// ─── Error codes that mean the session is irrecoverably dead ────────────────
// On these, we do a LOCAL logout only — no network call to /logout/.
const HARD_LOGOUT_CODES = new Set([
  "AUTH_REFRESH_EXPIRED",
  "AUTH_REVOKED_BY_SYSTEM",
  "AUTH_SESSION_EXPIRED",
  "AUTH_USER_NOT_FOUND",
]);

// ─── Error codes that mean the access token just expired ────────────────────
// sessionEngine should have prevented this, but if it slips through (e.g.
// the tab was in the background with the device sleeping), trigger one
// forced refresh attempt rather than a hard logout.
const SOFT_EXPIRY_CODES = new Set([
  "AUTH_ACCESS_EXPIRED",
]);

// ─── Request interceptor ─────────────────────────────────────────────────────

export function attachRequestInterceptor() {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    config.withCredentials = true;
    config.headers.set("X-Timezone-Offset", getTimezoneOffsetHeaderValue());

    const access = tokenManager.getAccess();
    if (access) {
      config.headers.set("Authorization", `Bearer ${access}`);
    }

    return config;
  };
}

// ─── Response error interceptor ──────────────────────────────────────────────

export function createResponseErrorInterceptor(onAuthFail: () => void) {
  return async (error: AxiosError): Promise<unknown> => {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const errorCode: string | undefined = data?.error_code;

    if (status !== 401) {
      return Promise.reject(error);
    }

    // ── Hard logout codes — session is dead, no recovery possible ────────────
    if (errorCode && HARD_LOGOUT_CODES.has(errorCode)) {
      tokenManager.clear();
      onAuthFail();
      return Promise.reject(error);
    }

    // ── Soft expiry — access token expired (device was sleeping, etc.) ────────
    // Let the sessionEngine attempt one forced refresh. Don't retry the request
    // automatically — the component that fired it will naturally re-render once
    // the store transitions back to ACTIVE.
    if (!errorCode || SOFT_EXPIRY_CODES.has(errorCode)) {
      sessionEngine.forceRefresh().catch(() => {
        // forceRefresh calls onExpired → setAnonymous internally if it fails.
      });
    }

    return Promise.reject(error);
  };
}
