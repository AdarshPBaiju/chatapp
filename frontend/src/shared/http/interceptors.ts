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

function isIdentityFlowRequest(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes("auth/identity/init/") ||
    url.includes("auth/identity/challenge/")
  );
}

// ─── Error codes that mean the session is irrecoverably dead ────────────────
// On these, we do a LOCAL logout only — no network call to /logout/.
const HARD_LOGOUT_CODES = new Set([
  "AUTH_REFRESH_EXPIRED",
  "AUTH_REVOKED_BY_SYSTEM",
  "AUTH_USER_NOT_FOUND",
]);

// ─── Error codes that mean the access token just expired ────────────────────
// sessionEngine should have prevented this, but if it slips through (e.g.
// the tab was in the background with the device sleeping), trigger one
// forced refresh attempt rather than a hard logout.
const SOFT_EXPIRY_CODES = new Set([
  "AUTH_ACCESS_EXPIRED",
  "AUTH_SESSION_EXPIRED",
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

// ─── Error codes from the identity flow (login). These are validation
// failures, NOT session expiry. Do NOT trigger any refresh logic.
const IDENTITY_FLOW_CODES = new Set([
  "IDENTITY_INVALID_CREDENTIALS",
  "IDENTITY_INVALID_CODE",
  "IDENTITY_FLOW_EXPIRED",
  "IDENTITY_METHOD_UNSUPPORTED",
]);

// ─── Response error interceptor ──────────────────────────────────────────────

export function createResponseErrorInterceptor(onAuthFail: () => void) {
  return async (error: AxiosError): Promise<unknown> => {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const errorCode: string | undefined = data?.error_code;
    const requestUrl = error.config?.url;

    if (status !== 401) {
      return Promise.reject(error);
    }

    if (isIdentityFlowRequest(requestUrl)) {
      return Promise.reject(error);
    }

    // ── Identity flow errors — pass through, these are handled by the UI ─────
    if (errorCode && IDENTITY_FLOW_CODES.has(errorCode)) {
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
