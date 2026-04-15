import { create } from "zustand";

import { authStorage } from "@/shared/lib/storage";
import { tokenManager } from "@/shared/auth/tokenManager";
import { AuthStatus, PendingVerification, SessionInfo, UserInfo } from "@/features/auth/types";

type AuthState = {
  status: AuthStatus;
  user: UserInfo | null;
  pendingVerification: PendingVerification | null;
  restrictedSessions: SessionInfo[];
  setAnonymous: () => void;
  setPendingVerification: (payload: PendingVerification) => void;
  setRestricted: (access: string, sessions: SessionInfo[], user?: UserInfo) => void;
  setFull: (params: { access: string; refresh: string; user?: UserInfo }) => void;
  hydrateUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "anonymous",
  user: null,
  pendingVerification: null,
  restrictedSessions: [],
  setAnonymous: () => {
    tokenManager.clearAccess();
    authStorage.clearRefresh();
    authStorage.clearRestrictedAccess();
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
  setRestricted: (access, sessions, user) => {
    tokenManager.setAccess(access);
    authStorage.clearRefresh();
    authStorage.setRestrictedAccess(access);
    authStorage.setRestrictedSessions(sessions);
    authStorage.setIsRestricted(true);
    const resolvedUser = user ?? authStorage.getUser() ?? null;
    if (resolvedUser) {
      authStorage.setUser(resolvedUser);
    }
    set({
      status: "restricted",
      user: resolvedUser,
      pendingVerification: null,
      restrictedSessions: sessions,
    });
  },
  setFull: ({ access, refresh, user }) => {
    tokenManager.setAccess(access);
    authStorage.setRefresh(refresh);
    authStorage.clearRestrictedAccess();
    authStorage.clearRestrictedSessions();
    authStorage.setIsRestricted(false);
    const resolvedUser = user ?? authStorage.getUser() ?? null;
    if (resolvedUser) {
      authStorage.setUser(resolvedUser);
    }
    set({
      status: "full",
      user: resolvedUser,
      pendingVerification: null,
      restrictedSessions: [],
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
      tokenManager.setAccess(access);
      set({ status: "restricted" });
    } else if (access && authStorage.getRefresh()) {
      set({ status: "full" });
    }
  },
}));
