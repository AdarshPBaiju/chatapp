import { useEffect, useState } from "react";

import { runBootstrapRefresh } from "@/modules/auth/utils/authFlows";
import { useAuthStore } from "@/modules/auth/state/authState";

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
