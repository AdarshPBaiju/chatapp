import { useAuthStore } from "@/features/auth/state";
import { listSessions, logout, revokeSession, revokeOthers } from "@/features/sessions/api";
import { authStorage } from "@/shared/lib/storage";

export async function fetchSessionsFlow(): Promise<void> {
  const result = await listSessions();
  
  if (result.is_promoted && result.access && result.refresh) {
    useAuthStore.getState().setFull({
      access: result.access,
      refresh: result.refresh,
    });
  } else if (result.access) {
    useAuthStore.getState().setRestricted(
      result.access, 
      result.refresh || "", 
      result.sessions || []
    );
  } else {
    const sessions = result.sessions || [];
    useAuthStore.setState({ restrictedSessions: sessions });
    authStorage.setRestrictedSessions(sessions);
  }
}

export async function revokeSessionFlow(sessionId: string): Promise<void> {
  const result = await revokeSession({ session_id: sessionId });

  if (result?.is_promoted && result.access && result.refresh) {
    const state = useAuthStore.getState();
    state.setFull({
      access: result.access,
      refresh: result.refresh,
    });
    return;
  }

  await fetchSessionsFlow();
}

export async function revokeOthersFlow(): Promise<void> {
  const result = await revokeOthers();

  if (result?.is_promoted && result.access && result.refresh) {
    const state = useAuthStore.getState();
    state.setFull({
      access: result.access,
      refresh: result.refresh,
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
