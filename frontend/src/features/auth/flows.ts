import { LoginRequest, RestrictedAuthPayload } from "@/features/auth/types";
import { useAuthStore } from "@/features/auth/state";
import { useIdentityMachine } from "@/features/auth/machine";
import { authStorage } from "@/shared/lib/storage";
import { readApiMessage, readApiErrorCode } from "@/shared/lib/apiResponse";
import {
  login,
  refreshToken,
  signUpRequest,
  validateOtp,
  identityInit,
  identityChallenge
} from "@/features/auth/api";

function isLikelyJweCompact(token: string): boolean {
  return token.split(".").length === 5;
}

function applyRestrictedAuth(payload: RestrictedAuthPayload): void {
  useAuthStore.getState().setRestricted(
    payload.access,
    payload.refresh,
    payload.active_sessions,
    payload.user,
  );
}

export async function runSignUpFlow(payload: { email: string }): Promise<void> {
  const data = await signUpRequest(payload);
  useAuthStore.getState().setPendingVerification({
    user_id: "",
    email: data.email,
    resend_interval: data.resend_interval,
  });
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
      code: params.code
    });

    if ("status" in data && data.status === "challenge_required") {
      machine.setChallenge(data);
    } else if ("access" in data) {
      const payload = data as any;
      authStore.setFull({
        access: payload.access,
        refresh: payload.refresh,
        user: payload.user
      });
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
    user: data.user,
  });
}

export async function runBootstrapRefresh(): Promise<void> {
  const isRestricted = authStorage.getIsRestricted();
  const restrictedAccess = authStorage.getRestrictedAccess();

  if (isRestricted && restrictedAccess) {
    if (!isLikelyJweCompact(restrictedAccess)) {
      useAuthStore.getState().setAnonymous();
      return;
    }

    useAuthStore.getState().setRestricted(
      restrictedAccess,
      authStorage.getRefresh() ?? "",
      authStorage.getRestrictedSessions(),
      authStorage.getUser() ?? undefined,
    );
    return;
  }

  const refresh = authStorage.getRefresh();
  if (!refresh) {
    useAuthStore.getState().setAnonymous();
    return;
  }

  if (!isLikelyJweCompact(refresh)) {
    useAuthStore.getState().setAnonymous();
    return;
  }

  try {
    const result = await refreshToken({ refresh });
    if (result.is_restricted) {
      applyRestrictedAuth(result);
      return;
    }

    useAuthStore.getState().setFull({
      access: result.access,
      refresh: result.refresh,
    });
  } catch {
    useAuthStore.getState().setAnonymous();
  }
}
