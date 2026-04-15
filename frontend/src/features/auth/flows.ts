import { authStorage } from "@/shared/lib/storage";
import { LoginRequest, RestrictedAuthPayload } from "@/features/auth/types";
import { useAuthStore } from "@/features/auth/state";
import { login, refreshToken, signUpRequest, validateOtp } from "@/features/auth/api";

function isLikelyJweCompact(token: string): boolean {
  // Current backend issues nested JWS-in-JWE compact tokens => 5 segments.
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
