import { useEffect, useState } from "react";
import { Activity, Laptop, Smartphone, Monitor, MapPin, Trash2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { fetchSessions, revokeSession, revokeOtherSessions } from "../api";
import { AuthSession } from "../types";
import { Button } from "@/shared/ui/FormControls";
import { cn } from "@/shared/lib/utils";

export function ActiveSessionsSection() {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const res = await fetchSessions();
      if (res.success && res.data) {
        setSessions(res.data.sessions);
      }
    } catch (err) {
      console.error("Failed to load sessions", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    try {
      setRevokingId(sessionId);
      const res = await revokeSession(sessionId);
      if (res.success) {
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to revoke session", err);
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    if (!confirm("Are you sure you want to log out all other devices?")) return;

    try {
      setRevokingOthers(true);
      const res = await revokeOtherSessions();
      if (res.success) {
        setSessions((prev) => prev.filter((s) => s.is_current));
      }
    } catch (err) {
      console.error("Failed to revoke other sessions", err);
    } finally {
      setRevokingOthers(false);
    }
  }

  function formatTime(timestamp: number) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 8400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function getDeviceIcon(label: string) {
    const l = label.toLowerCase();
    if (l.includes("windows") || l.includes("mac") || l.includes("linux")) return Laptop;
    if (l.includes("iphone") || l.includes("android")) return Smartphone;
    return Monitor;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
        <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Verifying devices...</p>
      </div>
    );
  }

  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Active Sessions</h2>
          <p className="text-muted-foreground text-xs font-medium">Manage the hardware signed into your account.</p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            compact
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:border-destructive/20 border-destructive/20"
            onClick={handleRevokeOthers}
            isLoading={revokingOthers}
          >
            Revoke All Others
          </Button>
        )}
      </div>

      <div className="grid gap-px bg-border border border-border rounded-xl overflow-hidden shadow-sm">
        <AnimatePresence mode="popLayout">
          {sessions.map((session) => {
            const Icon = getDeviceIcon(session.device);
            return (
              <motion.div
                layout
                key={session.session_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "group relative flex items-center justify-between gap-4 p-4 transition-colors",
                  session.is_current ? "bg-primary/[0.03]" : "bg-card hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center transition-all duration-300",
                    session.is_current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background"
                  )}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {session.device || "Secured Device"}
                      </p>
                      {session.is_current && (
                        <span className="flex items-center gap-1 bg-success/10 text-success text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-success/20">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="opacity-40" />
                        {session.city ? `${session.city}, ${session.country_code}` : "Private Location"}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} className="opacity-40" />
                        {session.is_current ? "Seen now" : `Seen ${formatTime(session.last_seen_at)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.session_id)}
                    disabled={revokingId === session.session_id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all disabled:opacity-50"
                    title="Terminate Session"
                  >
                    {revokingId === session.session_id ? (
                      <div className="h-4 w-4 border-2 border-destructive/20 border-t-destructive rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {sessions.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="h-24 w-24 bg-slate-50 rounded-[32px] flex items-center justify-center text-slate-200">
            <Activity size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Zero Trust Secured</h3>
            <p className="text-slate-400 text-sm font-medium tracking-tight">All sessions have been purged. You are currently isolated.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
