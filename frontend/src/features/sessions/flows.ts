import { useAuthStore } from "@/modules/auth/state/authState";
import { listSessions, logout, revokeSession, revokeOthers } from "@/features/sessions/api";
import { authStorage } from "@/shared/lib/storage";

export async function fetchSessionsFlow(): Promise<void> {
  const result = await listSessions();

  if (
    result.is_promoted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    useAuthStore.getState().setFull({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
    });
  } else if (
    result.is_restricted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    useAuthStore.getState().setRestricted({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
      sessions: result.active_sessions || result.sessions || [],
    });
  } else {
    const sessions = result.sessions || [];
    useAuthStore.setState({ restrictedSessions: sessions, status: "restricted" });
    authStorage.setRestrictedSessions(sessions);
  }
}

export async function revokeSessionFlow(sessionId: string): Promise<void> {
  const result = await revokeSession({ session_id: sessionId });

  if (
    result?.is_promoted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    const state = useAuthStore.getState();
    state.setFull({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
    });
    return;
  }

  if (
    result?.is_restricted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    useAuthStore.getState().setRestricted({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
      sessions: result.active_sessions || result.sessions || [],
    });
    return;
  }

  await fetchSessionsFlow();
}

export async function revokeOthersFlow(): Promise<void> {
  const result = await revokeOthers();

  if (
    result?.is_promoted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    const state = useAuthStore.getState();
    state.setFull({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
    });
    return;
  }

  if (
    result?.is_restricted &&
    result.access &&
    result.refresh &&
    typeof result.access_exp === "number" &&
    typeof result.refresh_exp === "number"
  ) {
    useAuthStore.getState().setRestricted({
      access: result.access,
      refresh: result.refresh,
      access_exp: result.access_exp,
      refresh_exp: result.refresh_exp,
      sessions: result.active_sessions || result.sessions || [],
    });
    return;
  }

  await fetchSessionsFlow();
}

export async function logoutFlow(): Promise<void> {
  try {
    await logout();
  } finally {
    useAuthStore.getState().setAnonymous();
  }
}
