let accessToken: string | null = null;

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
};
