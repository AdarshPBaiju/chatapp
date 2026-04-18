import { LoginRequest, RestrictedAuthPayload } from "@/features/auth/types";
import { useAuthStore } from "@/features/auth/state";
import { useIdentityMachine } from "@/features/auth/machine";
import { authStorage } from "@/shared/lib/storage";
import { readApiMessage, readApiErrorCode } from "@/shared/lib/apiResponse";
import { sessionEngine } from "@/shared/auth/sessionEngine";
import { refreshToken as apiRefreshToken } from "@/features/auth/api";
import {
  login,
  signUpRequest,
  validateOtp,
  identityInit,
  identityChallenge,
} from "@/features/auth/api";

let bootstrapRefreshPromise: Promise<void> | null = null;

function isLikelyJweCompact(token: string): boolean {
  return token.split(".").length === 5;
}

function applyRestrictedAuth(payload: RestrictedAuthPayload): void {
  useAuthStore.getState().setRestricted({
    access: payload.access,
    refresh: payload.refresh,
    access_exp: payload.access_exp,
    refresh_exp: payload.refresh_exp,
    sessions: payload.active_sessions,
    user: payload.user,
  });
}

export async function runSignUpFlow(payload: { email: string }): Promise<{
  email: string;
  resend_interval: number;
}> {
  return signUpRequest(payload);
}

export async function runLoginFlow(payload: LoginRequest): Promise<void> {
  const data = await login(payload);

  if ("status" in data && data.status === "pending_verification") {
    useAuthStore.getState().setPendingVerification({
      user_id: data.user_id,
      email: data.email,
      resend_interval: data.resend_interval,
    });
    return;
  }

  if ("is_restricted" in data && data.is_restricted) {
    applyRestrictedAuth(data);
    return;
  }

  if ("is_restricted" in data && !data.is_restricted) {
    useAuthStore.getState().setFull({
      access: data.access,
      refresh: data.refresh,
      access_exp: data.access_exp,
      refresh_exp: data.refresh_exp,
      user: data.user,
    });
  }
}

export async function runIdentityInit(email: string): Promise<void> {
  const machine = useIdentityMachine.getState();
  machine.setLoading(true);
  try {
    const data = await identityInit({ email });
    machine.setChallenge(data);
    useAuthStore.getState().setAnonymous();
  } catch (error: any) {
    machine.setError(error.message || "Failed to initialize identity flow.");
  }
}

export async function runIdentityChallenge(params: {
  method: string;
  password?: string;
  code?: string;
}): Promise<void> {
  const machine = useIdentityMachine.getState();
  const authStore = useAuthStore.getState();

  if (!machine.hitToken) {
    machine.setError("Session expired. Please restart login.");
    return;
  }

  machine.setLoading(true);
  try {
    const data = await identityChallenge({
      hit: machine.hitToken,
      method: params.method,
      expected_step: machine.expectedStep,
      password: params.password,
      code: params.code,
    });

    if ("status" in data && data.status === "challenge_required") {
      machine.setChallenge(data);
    } else if ("access" in data) {
      const payload = data as any;
      if (payload.is_restricted) {
        authStore.setRestricted({
          access: payload.access,
          refresh: payload.refresh,
          access_exp: payload.access_exp,
          refresh_exp: payload.refresh_exp,
          sessions: payload.active_sessions ?? [],
          user: payload.user,
        });
      } else {
        authStore.setFull({
          access: payload.access,
          refresh: payload.refresh,
          access_exp: payload.access_exp,
          refresh_exp: payload.refresh_exp,
          user: payload.user,
        });
      }
      machine.reset();
    }
  } catch (error: any) {
    const message = readApiMessage(error);
    const errorCode = readApiErrorCode(error);
    machine.setError(message);

    if (errorCode === "IDENTITY_FLOW_EXPIRED") {
      setTimeout(() => machine.reset(), 1500);
    }
  }
}

export async function runOtpValidationFlow(userId: string, otpCode: string): Promise<void> {
  const data = await validateOtp({ user_id: userId, otp_code: otpCode });
  if (data.is_restricted) {
    applyRestrictedAuth(data);
    return;
  }

  useAuthStore.getState().setFull({
    access: data.access,
    refresh: data.refresh,
    access_exp: data.access_exp,
    refresh_exp: data.refresh_exp,
    user: data.user,
  });
}

/**
 * The refresh callback given to sessionEngine.
 * Called by the engine's internal scheduler — never called directly by components.
 */
async function doSessionRefresh() {
  const refresh = authStorage.getRefresh();
  if (!refresh) throw new Error("No refresh token stored.");

  const result = await apiRefreshToken({ refresh });

  if (result.is_restricted) {
    // Restricted session: still give the engine valid tokens so it can schedule
    // the next refresh, but also update the store to show the restricted UI.
    useAuthStore.getState().setRestricted({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
      sessions: result.active_sessions,
    });
    return {
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
    };
  }

  // Full session rotation — state.ts will call sessionEngine.startSession internally
  useAuthStore.getState().setFull({
    access: result.access,
    refresh: result.refresh,
    access_exp: result.access_exp,
    refresh_exp: result.refresh_exp,
  });

  return {
    access: result.access,
    refresh: result.refresh,
    access_exp: result.access_exp,
    refresh_exp: result.refresh_exp,
  };
}

function onSessionExpired() {
  useAuthStore.getState().setAnonymous();
}

export async function runBootstrapRefresh(): Promise<void> {
  if (bootstrapRefreshPromise) {
    return bootstrapRefreshPromise;
  }

  bootstrapRefreshPromise = (async () => {
  // Wire the engine callbacks once at boot.
    sessionEngine.init(doSessionRefresh, onSessionExpired);

    const isRestricted = authStorage.getIsRestricted();
    const restrictedAccess = authStorage.getRestrictedAccess();

    if (isRestricted && restrictedAccess) {
      const restrictedAccessExp = authStorage.getRestrictedAccessExp();
      if (
        !restrictedAccessExp ||
        restrictedAccessExp <= Math.floor(Date.now() / 1000)
      ) {
        useAuthStore.getState().setAnonymous();
        return;
      }
      if (!isLikelyJweCompact(restrictedAccess)) {
        useAuthStore.getState().setAnonymous();
        return;
      }
      useAuthStore.getState().setRestricted({
        access: restrictedAccess,
        refresh: authStorage.getRefresh() ?? "",
        access_exp: restrictedAccessExp,
        refresh_exp: authStorage.getRefreshExp() ?? 0,
        sessions: authStorage.getRestrictedSessions(),
        user: authStorage.getUser() ?? undefined,
      });
      return;
    }

    const refresh = authStorage.getRefresh();
    if (!refresh || !isLikelyJweCompact(refresh)) {
      useAuthStore.getState().setAnonymous();
      return;
    }

    try {
      const result = await apiRefreshToken({ refresh });
      if (result.is_restricted) {
        applyRestrictedAuth(result);
        return;
      }

      useAuthStore.getState().setFull({
        access: result.access,
        refresh: result.refresh,
        access_exp: result.access_exp,
        refresh_exp: result.refresh_exp,
      });
    } catch {
      useAuthStore.getState().setAnonymous();
    }
  })();

  try {
    await bootstrapRefreshPromise;
  } finally {
    bootstrapRefreshPromise = null;
  }
}

export async function runSignUpFinalizeFlow(params: {
  signup_token: string;
  full_name: string;
  password: string;
  confirm_password: string;
}): Promise<{ is_restricted: boolean }> {
  const { signUpFinalize } = await import("@/features/auth/api");
  const data = await signUpFinalize(params);

  if (data.is_restricted) {
    applyRestrictedAuth(data);
    return { is_restricted: true };
  }

  useAuthStore.getState().setFull({
    access: data.access,
    refresh: data.refresh,
    access_exp: data.access_exp,
    refresh_exp: data.refresh_exp,
    user: data.user,
  });

  return { is_restricted: false };
}
