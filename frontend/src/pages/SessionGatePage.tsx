import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/features/auth/state";
import { fetchSessionsFlow, revokeSessionFlow, revokeOthersFlow } from "@/features/sessions/flows";
import { SessionList } from "@/features/sessions/components/SessionList";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

export function SessionGatePage() {
  const navigate = useNavigate();
  const sessions = useAuthStore((state) => state.restrictedSessions).filter((s) => !s.is_current);
  const status = useAuthStore((state) => state.status);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchSessionsFlow().catch((e) => {
      setError(readApiMessage(e, "Failed to load sessions."));
    });
  }, []);

  useEffect(() => {
    if (status === "full") {
      navigate("/dashboard");
    }
  }, [status, navigate]);

  async function onRevoke(sessionId: string) {
    setLoading(true);
    setError(undefined);
    try {
      await revokeSessionFlow(sessionId);
    } catch (e) {
      setError(readApiMessage(e, "Failed to revoke session."));
    } finally {
      setLoading(false);
    }
  }

  async function onRevokeAllOthers() {
    if (!window.confirm("Are you sure you want to revoke all other sessions? This will logout all your other devices.")) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await revokeOthersFlow();
    } catch (e) {
      setError(readApiMessage(e, "Failed to revoke other sessions."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <Card>
        <div className="flex-between align-center mb-6">
          <div className="stack gap-1">
            <h1 className="h3">Session Limit reached</h1>
            <p className="text-muted">Revoke an existing device to continue with full access.</p>
          </div>
          <button 
            className="danger outline" 
            onClick={onRevokeAllOthers}
            disabled={loading || sessions.length === 0}
          >
            Revoke all other devices
          </button>
        </div>
        <FormError message={error} />
        <SessionList sessions={sessions} onRevoke={onRevoke} disabled={loading} />
      </Card>
    </main>
  );
}
