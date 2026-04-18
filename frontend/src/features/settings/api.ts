import { httpClient } from "@/shared/http/client";
import { ApiEnvelope } from "@/shared/types/api";
import { UserProfile, TwoFactorSetup, TwoFactorVerification, AuthSession } from "./types";

export async function fetchProfile(): Promise<ApiEnvelope<UserProfile>> {
  const response = await httpClient.get("/profile/");
  return response.data;
}

export async function updateProfile(data: Partial<UserProfile>): Promise<ApiEnvelope<UserProfile>> {
  const response = await httpClient.patch("/profile/", data);
  return response.data;
}

export async function setupTwoFactor(): Promise<ApiEnvelope<TwoFactorSetup>> {
  const response = await httpClient.post("/security/2fa/setup/");
  return response.data;
}

export async function verifyTwoFactor(code: string): Promise<ApiEnvelope<TwoFactorVerification>> {
  const response = await httpClient.post("/security/2fa/verify/", { code });
  return response.data;
}

export async function getBackupCodes(password: string): Promise<ApiEnvelope<TwoFactorVerification>> {
  const response = await httpClient.post("/security/2fa/backup-codes/", { password });
  return response.data;
}

export async function fetchSessions(): Promise<ApiEnvelope<{ sessions: AuthSession[] }>> {
  const response = await httpClient.get("/sessions/");
  return response.data;
}

export async function revokeSession(sessionId: string): Promise<ApiEnvelope<null>> {
  const response = await httpClient.post("/sessions/revoke/", { session_id: sessionId });
  return response.data;
}

export async function revokeOtherSessions(): Promise<ApiEnvelope<{ revoked_count: number }>> {
  const response = await httpClient.post("/sessions/revoke-others/");
  return response.data;
}
