import { httpClient } from "@/shared/http/client";
import { unwrapEnvelope } from "@/shared/lib/apiResponse";
import { ApiEnvelope } from "@/shared/types/api";
import { SessionInfo } from "@/features/auth/types";

export type RevokeResponse = {
  is_promoted?: boolean;
  access?: string;
  refresh?: string;
};

export type ListSessionsResponse = {
  sessions: SessionInfo[];
  is_promoted?: boolean;
  access?: string;
  refresh?: string;
};

export async function listSessions(): Promise<ListSessionsResponse> {
  const response = await httpClient.get<ApiEnvelope<ListSessionsResponse>>("/sessions/");
  return unwrapEnvelope(response);
}

export async function revokeSession(payload: {
  session_id?: string;
  access_jti?: string;
}): Promise<RevokeResponse | null> {
  const response = await httpClient.post<ApiEnvelope<RevokeResponse | null>>(
    "/sessions/revoke/",
    payload,
  );
  return response.data.data;
}

export async function logout(): Promise<void> {
  await httpClient.post<ApiEnvelope<null>>("/logout/");
}

export async function revokeOthers(): Promise<RevokeResponse | null> {
  const response = await httpClient.post<ApiEnvelope<RevokeResponse | null>>(
    "/sessions/revoke-others/",
  );
  return response.data.data;
}
