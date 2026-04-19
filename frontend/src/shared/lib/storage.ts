const REFRESH_KEY = "chatapp.auth.refresh_token";
const REFRESH_EXP_KEY = "chatapp.auth.refresh_exp";
const USER_KEY = "chatapp.auth.user";
const RESTRICTED_KEY = "chatapp.auth.restricted";
const RESTRICTED_ACCESS_KEY = "chatapp.auth.restricted_access_token";
const RESTRICTED_ACCESS_EXP_KEY = "chatapp.auth.restricted_access_exp";
const RESTRICTED_SESSIONS_KEY = "chatapp.auth.restricted_sessions";

export type StoredSession = {
  session_id: string;
  access_jti: string;
  refresh_jti: string;
  device: string;
  started_at: number;
  last_seen_at: number;
  is_current: boolean;
  city?: string;
  country_code?: string;
};

export type StoredUser = {
  id: string;
  email: string;
  full_name?: string;
};

export interface AuthStorage {
  getRefresh(): string | null;
  setRefresh(value: string): void;
  clearRefresh(): void;
  getRefreshExp(): number | null;
  setRefreshExp(ts: number): void;
  clearRefreshExp(): void;
  getRestrictedAccess(): string | null;
  setRestrictedAccess(value: string): void;
  clearRestrictedAccess(): void;
  getRestrictedAccessExp(): number | null;
  setRestrictedAccessExp(ts: number): void;
  clearRestrictedAccessExp(): void;
  getRestrictedSessions(): StoredSession[];
  setRestrictedSessions(value: StoredSession[]): void;
  clearRestrictedSessions(): void;
  getUser(): StoredUser | null;
  setUser(user: StoredUser): void;
  clearUser(): void;
  getIsRestricted(): boolean;
  setIsRestricted(value: boolean): void;
}

export const authStorage: AuthStorage = {
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  setRefresh(value: string) {
    localStorage.setItem(REFRESH_KEY, value);
  },
  clearRefresh() {
    localStorage.removeItem(REFRESH_KEY);
  },
  getRefreshExp(): number | null {
    const raw = localStorage.getItem(REFRESH_EXP_KEY);
    return raw ? parseInt(raw, 10) : null;
  },
  setRefreshExp(ts: number) {
    localStorage.setItem(REFRESH_EXP_KEY, ts.toString());
  },
  clearRefreshExp() {
    localStorage.removeItem(REFRESH_EXP_KEY);
  },
  getRestrictedAccess(): string | null {
    return localStorage.getItem(RESTRICTED_ACCESS_KEY);
  },
  setRestrictedAccess(value: string) {
    localStorage.setItem(RESTRICTED_ACCESS_KEY, value);
  },
  clearRestrictedAccess() {
    localStorage.removeItem(RESTRICTED_ACCESS_KEY);
  },
  getRestrictedAccessExp(): number | null {
    const raw = localStorage.getItem(RESTRICTED_ACCESS_EXP_KEY);
    return raw ? parseInt(raw, 10) : null;
  },
  setRestrictedAccessExp(ts: number) {
    localStorage.setItem(RESTRICTED_ACCESS_EXP_KEY, ts.toString());
  },
  clearRestrictedAccessExp() {
    localStorage.removeItem(RESTRICTED_ACCESS_EXP_KEY);
  },
  getRestrictedSessions(): StoredSession[] {
    const raw = localStorage.getItem(RESTRICTED_SESSIONS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as StoredSession[]) : [];
    } catch {
      localStorage.removeItem(RESTRICTED_SESSIONS_KEY);
      return [];
    }
  },
  setRestrictedSessions(value: StoredSession[]) {
    localStorage.setItem(RESTRICTED_SESSIONS_KEY, JSON.stringify(value));
  },
  clearRestrictedSessions() {
    localStorage.removeItem(RESTRICTED_SESSIONS_KEY);
  },
  getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  setUser(user: StoredUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser() {
    localStorage.removeItem(USER_KEY);
  },
  getIsRestricted(): boolean {
    return localStorage.getItem(RESTRICTED_KEY) === "true";
  },
  setIsRestricted(value: boolean) {
    if (value) {
      localStorage.setItem(RESTRICTED_KEY, "true");
    } else {
      localStorage.removeItem(RESTRICTED_KEY);
    }
  },
};
