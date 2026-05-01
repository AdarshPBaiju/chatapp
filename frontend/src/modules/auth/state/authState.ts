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

type AuthState = {
  status: AuthStatus;
  user: UserInfo | null;
  pendingVerification: PendingVerification | null;
  restrictedSessions: SessionInfo[];
  setAnonymous: () => void;
  setPendingVerification: (payload: PendingVerification) => void;
  setRestricted: (params: SetRestrictedParams) => void;
  setFull: (params: SetFullParams) => void;
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
    authStorage.setRestrictedSessions(sessions);
    authStorage.setIsRestricted(true);
    const resolvedUser = user ?? authStorage.getUser() ?? null;
    if (resolvedUser) authStorage.setUser(resolvedUser);
    set({
      status: "restricted",
      user: resolvedUser,
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
    const resolvedUser = user ?? authStorage.getUser() ?? null;
    if (resolvedUser) authStorage.setUser(resolvedUser);
    set({
      status: "full",
      user: resolvedUser,
      pendingVerification: null,
      restrictedSessions: [],
    });
  },

  setOffline: () => {
    const user = authStorage.getUser();
    set({
      status: "offline",
      user: user ?? null,
    });
  },

  hydrateUser: () => {
    const user = authStorage.getUser();
    const isRestricted = authStorage.getIsRestricted();
    const access = isRestricted
      ? authStorage.getRestrictedAccess() ?? tokenManager.getAccess()
      : tokenManager.getAccess();

    if (user) {
      set({ user });
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
