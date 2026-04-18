import { tokenManager } from "@/shared/auth/tokenManager";

const channel = new BroadcastChannel('auth_refresh_channel');

let inflight: Promise<any> | null = null;
let crossTabResolve: ((val: any) => void) | null = null;

channel.onmessage = (event) => {
  if (event.data?.type === 'TOKEN_REFRESHED') {
    const currentAccess = tokenManager.getAccess();
    if (currentAccess && crossTabResolve) {
      crossTabResolve({ kind: "full", access: currentAccess });
      crossTabResolve = null;
    }
  }
};

export async function runSingleFlightRefresh<T>(
  refreshTask: () => Promise<T>,
): Promise<T> {
  if (inflight) {
    return inflight;
  }

  const lockTime = parseInt(localStorage.getItem('auth_refreshing') || '0', 10);
  const now = Date.now();
  const isAnotherTabRefreshing = lockTime > 0 && (now - lockTime < 10000);

  if (isAnotherTabRefreshing) {
    inflight = new Promise<T>((resolve, reject) => {
      crossTabResolve = resolve;
      
      const timeout = setTimeout(() => {
        crossTabResolve = null;
        reject(new Error("Timeout waiting for cross-tab refresh."));
      }, 10000);

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'TOKEN_REFRESH_FAILED') {
          clearTimeout(timeout);
          crossTabResolve = null;
          channel.removeEventListener('message', handler);
          reject(new Error("Cross-tab refresh failed."));
        } else if (event.data?.type === 'TOKEN_REFRESHED') {
          clearTimeout(timeout);
          channel.removeEventListener('message', handler);
        }
      };
      channel.addEventListener('message', handler);
    });
    
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }

  localStorage.setItem('auth_refreshing', now.toString());

  inflight = refreshTask()
    .then((result) => {
      channel.postMessage({ type: 'TOKEN_REFRESHED' });
      return result;
    })
    .catch((err) => {
      channel.postMessage({ type: 'TOKEN_REFRESH_FAILED' });
      throw err;
    })
    .finally(() => {
      localStorage.removeItem('auth_refreshing');
      inflight = null;
    });

  return inflight as Promise<T>;
}
