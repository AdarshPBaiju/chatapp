import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import { env } from "@/shared/lib/env";
import { getTimezoneOffsetHeaderValue } from "@/shared/lib/timezone";
import { authStorage } from "@/shared/lib/storage";
import { ApiEnvelope } from "@/shared/types/api";
import { tokenManager } from "@/shared/auth/tokenManager";
import { runSingleFlightRefresh } from "@/shared/auth/refreshCoordinator";
import { useAuthStore } from "@/features/auth/state";
import { SessionInfo } from "@/features/auth/types";

type RefreshPayload = {
  is_restricted: false;
  access: string;
  refresh: string;
};

type RestrictedRefreshPayload = {
  is_restricted: true;
  access: string;
  refresh: string;
  active_sessions: SessionInfo[];
};

type RetryableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

type RefreshOutcome =
  | {
      kind: "full";
      access: string;
    }
  | {
      kind: "restricted";
    };

function shouldSkipRefresh(url?: string): boolean {
  if (!url) return false;
  const path = url.toLowerCase();
  return (
    path.includes("/login/") ||
    path.includes("/signup/") ||
    path.includes("/otp-validate/") ||
    path.includes("/otp-resend/") ||
    path.includes("/token/refresh/")
  );
}

async function bestEffortLogoutCurrentSession(): Promise<void> {
  const access = tokenManager.getAccess();
  if (!access) {
    return;
  }

  try {
    await axios.post(
      `${env.apiBaseUrl}/logout/`,
      undefined,
      {
        withCredentials: true,
        validateStatus: () => true,
        headers: {
          Authorization: `Bearer ${access}`,
          "X-Timezone-Offset": getTimezoneOffsetHeaderValue(),
        },
      },
    );
  } catch {
    // Ignore cleanup failures and fall back to local auth reset.
  }
}

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refresh = authStorage.getRefresh();
  if (!refresh) {
    throw new Error("No refresh token available.");
  }

  try {
    const response = await axios.post<ApiEnvelope<RefreshPayload | RestrictedRefreshPayload>>(
      `${env.apiBaseUrl}/token/refresh/`,
      { refresh },
      {
        withCredentials: true,
        headers: {
          "X-Timezone-Offset": getTimezoneOffsetHeaderValue(),
        },
      },
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || "Refresh failed.");
    }

    const payload = response.data.data;
    if (payload.is_restricted) {
      useAuthStore.getState().setRestricted(payload.access, payload.refresh, payload.active_sessions);
      return { kind: "restricted" };
    }

    const nextAccess = payload.access;
    const nextRefresh = payload.refresh;
    tokenManager.setAccess(nextAccess);
    authStorage.setRefresh(nextRefresh);
    return {
      kind: "full",
      access: nextAccess,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Advanced Race Condition Handling:
      // If the backend says the refresh token was already used (401),
      // check if a concurrent successful refresh updated storage in the meantime.
      const currentRefresh = authStorage.getRefresh();
      const currentAccess = tokenManager.getAccess();
      
      if (currentRefresh && currentRefresh !== refresh && currentAccess) {
        return {
          kind: "full",
          access: currentAccess,
        };
      }
    }
    throw error;
  }
}

export function attachRequestInterceptor() {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const nextConfig = config;
    nextConfig.withCredentials = true;
    nextConfig.headers.set("X-Timezone-Offset", getTimezoneOffsetHeaderValue());

    const access = tokenManager.getAccess();
    if (access) {
      nextConfig.headers.set("Authorization", `Bearer ${access}`);
    }

    return nextConfig;
  };
}

export function createResponseErrorInterceptor(onAuthFail: () => void) {
  return async (error: AxiosError): Promise<unknown> => {
    const status = error.response?.status;
    const originalRequest = error.config as RetryableConfig | undefined;

    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      shouldSkipRefresh(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    const refresh = authStorage.getRefresh();
    if (!refresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshOutcome = await runSingleFlightRefresh(refreshAccessToken);
      if (refreshOutcome.kind === "restricted") {
        return Promise.reject(
          new Error("Session limit reached. Revoke an existing session to continue."),
        );
      }

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${refreshOutcome.access}`;
      return axios(originalRequest);
    } catch (refreshError) {
      // Handle "Session limit reached" from dynamic middleware (not just refresh)
      const message = (refreshError as any)?.response?.data?.message || "";
      if (message.includes("Session limit reached")) {
         // The authentication middleware downgraded us. We should have been put in restricted mode 
         // but if it happened during a normal request, we need to handle the state transition.
         // Usually, we want to just reject and let the app handle the "restricted" status if set by middleware.
         // Actually, let's trigger a session list fetch to be sure.
         return Promise.reject(refreshError);
      }

      await bestEffortLogoutCurrentSession();
      onAuthFail();
      return Promise.reject(refreshError);
    }
  };
}
