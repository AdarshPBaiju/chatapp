import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, LogOut, ShieldAlert, Laptop, Smartphone } from "lucide-react";

import { useAuthStore } from "@/features/auth/state";
import { fetchSessionsFlow, revokeSessionFlow, revokeOthersFlow } from "@/features/sessions/flows";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button } from "@/shared/ui/FormControls";

export function SessionGatePage() {
  const navigate = useNavigate();
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const sessions = useAuthStore((state) => state.restrictedSessions) || [];
  const otherSessions = sessions.filter((s) => !s.is_current);
  const status = useAuthStore((state) => state.status);

  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState<string | boolean>(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    void fetchSessionsFlow().catch((e) => {
      if (e?.response?.status !== 401) {
        setError(readApiMessage(e, "Failed to load sessions."));
      }
    });
  }, []);

  useEffect(() => {
    if (status === "full") {
      navigate("/settings/profile");
    }
  }, [status, navigate]);

  async function onRevoke(sessionId: string) {
    setLoading(sessionId);
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
    if (!window.confirm("Are you sure you want to revoke all other sessions?")) {
      return;
    }
    setGlobalLoading(true);
    setError(undefined);
    try {
      await revokeOthersFlow();
    } catch (e) {
      setError(readApiMessage(e, "Failed to revoke other sessions."));
    } finally {
      setGlobalLoading(false);
    }
  }

  function handleLogout() {
    setAnonymous();
    navigate("/auth/login");
  }

  function timeAgo(timestamp: number) {
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const seconds = Math.floor((Date.now() - ms) / 1000);

    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ms).toLocaleDateString();
  }

  return (
    <AuthLayout
      heading="Review active sessions"
      subheading="You reached the device limit. Revoke another session to continue."
    >
      <div className="space-y-8 animate-fade-in-up">
        <div className="flex items-start gap-4 rounded-[24px] border border-primary/20 bg-primary/5 p-5">
          <ShieldAlert className="shrink-0 text-primary" size={20} />
          <p className="text-sm leading-6 text-muted-foreground">
            Revoke one of the other sessions below to complete sign-in on this device.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 px-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Other Active Devices
            </span>
            {otherSessions.length > 1 && (
              <button
                onClick={onRevokeAllOthers}
                disabled={globalLoading}
                className="text-sm font-bold text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
              >
                Revoke All
              </button>
            )}
          </div>

          <div className="space-y-3">
            {otherSessions.map((session) => (
              <div
                key={session.session_id}
                className="group relative rounded-[24px] border border-border bg-card p-5 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                      {session.device?.toLowerCase().includes("phone") ? <Smartphone size={18} /> : <Laptop size={18} />}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <h3 className="truncate text-sm font-bold leading-tight text-foreground">
                        {session.device || "Unknown Device"}
                      </h3>
                      <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        {session.city || "Unknown"}, {session.country_code} • {timeAgo(session.last_seen_at)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="social"
                    className="group/btn h-10 w-10 shrink-0 rounded-xl border-destructive/20 p-0 text-destructive hover:border-destructive/30 hover:bg-destructive/10"
                    onClick={() => onRevoke(session.session_id)}
                    isLoading={loading === session.session_id}
                    disabled={!!loading || globalLoading}
                  >
                    {!loading && <LogOut size={14} className="transition-transform group-hover/btn:scale-110" />}
                  </Button>
                </div>
              </div>
            ))}

            {otherSessions.length === 0 && (
              <div className="rounded-[24px] border-2 border-dashed border-border bg-muted/30 py-12 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground/40">
                  <Monitor size={32} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Everything Clear</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
          {error && (
            <div className="animate-shake rounded-xl border border-destructive/20 bg-destructive/10 px-5 py-3 text-center text-sm text-destructive">
              {error}
            </div>
          )}
          <Button variant="link" className="w-full justify-center text-sm" onClick={handleLogout}>
            Sign in with a different account
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
