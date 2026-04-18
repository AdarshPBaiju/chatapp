/**
 * In-memory token store.
 *
 * Stores the access token string and both expiry timestamps (Unix seconds)
 * that the backend returns with every token issuance.
 * The sessionEngine reads these to schedule proactive refresh.
 */
let accessToken: string | null = null;
let accessExpTs: number | null = null;
let refreshExpTs: number | null = null;

export const tokenManager = {
  getAccess(): string | null {
    return accessToken;
  },
  setAccess(token: string) {
    accessToken = token;
  },
  clearAccess() {
    accessToken = null;
  },

  getAccessExp(): number | null {
    return accessExpTs;
  },
  setAccessExp(ts: number) {
    accessExpTs = ts;
  },

  getRefreshExp(): number | null {
    return refreshExpTs;
  },
  setRefreshExp(ts: number) {
    refreshExpTs = ts;
  },

  /** Set access token + both expiry timestamps in one call. */
  setTokens(token: string, accessExp: number, refreshExp: number) {
    accessToken = token;
    accessExpTs = accessExp;
    refreshExpTs = refreshExp;
  },

  clear() {
    accessToken = null;
    accessExpTs = null;
    refreshExpTs = null;
  },
};
