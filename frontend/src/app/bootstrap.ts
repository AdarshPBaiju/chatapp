import { useEffect, useState } from "react";

import { runBootstrapRefresh } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";

export function useAuthBootstrap(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await runBootstrapRefresh();
      } catch {
        useAuthStore.getState().setAnonymous();
      } finally {
        if (active) {
          setReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return ready;
}
