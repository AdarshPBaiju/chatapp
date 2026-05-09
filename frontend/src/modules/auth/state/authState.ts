import { create } from "zustand";

import { authStorage } from "@/shared/lib/storage";
import { tokenManager } from "@/shared/auth/tokenManager";
import { sessionEngine } from "@/shared/auth/sessionEngine";
import { AuthStatus, PendingVerification, SessionInfo, UserInfo } from "../api/types";

type SetFullParams = {
  access: string;
  refresh: string;
  access_exp: number;
  refresh_exp: number;
  user?: UserInfo;
};

type SetRestrictedParams = {
  access: string;
  refresh: string;
  access_exp: number;
  refresh_exp: number;
  sessions: SessionInfo[];
  user?: UserInfo;
};

/** Normalize any user object shape into a consistent UserInfo */
function normalizeUser(user: any): UserInfo | null {
  if (!user) return null;
  return {
    ...user,
    id: user.id || user.user_id || user.sub || "",
    email: user.email || "",
    full_name: user.full_name || user.name || "",
  };
}

type AuthState = {
  status: AuthStatus;
  user: UserInfo | null;
  pendingVerification: PendingVerification | null;
  restrictedSessions: SessionInfo[];
  setAnonymous: () => void;
  setPendingVerification: (payload: PendingVerification) => void;
  setRestricted: (params: SetRestrictedParams) => void;
  setFull: (params: SetFullParams) => void;
  setUser: (user: any) => void;
  setOffline: () => void;
  hydrateUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "anonymous",
  user: null,
  pendingVerification: null,
  restrictedSessions: [],

  setAnonymous: () => {
    sessionEngine.broadcastLogout();
    sessionEngine.stop();
    authStorage.clearRefresh();
    authStorage.clearRefreshExp();
    authStorage.clearRestrictedAccess();
    authStorage.clearRestrictedAccessExp();
    authStorage.clearRestrictedSessions();
    authStorage.clearUser();
    authStorage.setIsRestricted(false);
    set({
      status: "anonymous",
      user: null,
      pendingVerification: null,
      restrictedSessions: [],
    });
  },

  setPendingVerification: (payload) =>
    set({
      status: "pending_verification",
      pendingVerification: payload,
      restrictedSessions: [],
    }),

  setRestricted: ({ access, refresh, access_exp, refresh_exp, sessions, user }) => {
    sessionEngine.startRestrictedSession({ access, refresh, access_exp, refresh_exp });
    authStorage.setRestrictedAccess(access);
    authStorage.setRestrictedAccessExp(access_exp);
    authStorage.setRestrictedSessions(sessions ?? []);
    authStorage.setIsRestricted(true);
    const resolved = user ?? authStorage.getUser() ?? null;
    const normalized = normalizeUser(resolved);
    if (normalized) authStorage.setUser(normalized);
    set({
      status: "restricted",
      user: normalized,
      pendingVerification: null,
      restrictedSessions: sessions ?? [],
    });
  },

  setFull: ({ access, refresh, access_exp, refresh_exp, user }) => {
    sessionEngine.startSession({ access, refresh, access_exp, refresh_exp });
    authStorage.clearRestrictedAccess();
    authStorage.clearRestrictedAccessExp();
    authStorage.clearRestrictedSessions();
    authStorage.setIsRestricted(false);
    const resolved = user ?? authStorage.getUser() ?? null;
    const normalized = normalizeUser(resolved);
    if (normalized) authStorage.setUser(normalized);
    set({
      status: "full",
      user: normalized,
      pendingVerification: null,
      restrictedSessions: [],
    });
  },

  setUser: (user) => {
    const normalized = normalizeUser(user);
    if (!normalized) return;
    authStorage.setUser(normalized);
    set({ user: normalized });
  },

  setOffline: () => {
    const user = authStorage.getUser();
    set({
      status: "offline",
      user: user ? normalizeUser(user) : null,
    });
  },

  hydrateUser: () => {
    const user = authStorage.getUser();
    const isRestricted = authStorage.getIsRestricted();
    const access = isRestricted
      ? authStorage.getRestrictedAccess() ?? tokenManager.getAccess()
      : tokenManager.getAccess();

    if (user) {
      set({ user: normalizeUser(user) });
    }

    if (access && isRestricted) {
      tokenManager.setTokens(
        access,
        authStorage.getRestrictedAccessExp() ?? 0,
        authStorage.getRefreshExp() ?? 0,
      );
      set({ status: "restricted" });
    } else if (access && authStorage.getRefresh()) {
      set({ status: "full" });
    }
  },
}));
