import { useEffect, useState } from "react";
import { Activity, Laptop, Smartphone, Monitor, MapPin, ShieldCheck, Trash2, Clock, Check } from "lucide-react";
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
        <div className="h-10 w-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">Verifying devices...</p>
      </div>
    );
  }

  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-50 pb-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Active Devices</h2>
          <p className="text-slate-500 text-sm font-medium tracking-wide">Monitor and manage the hardware currently signed into your account.</p>
        </div>
        {otherSessions.length > 0 && (
          <Button 
            variant="outline" 
            className="text-rose-600 hover:bg-rose-50 hover:border-rose-100 border-rose-100 text-[10px] font-black uppercase tracking-[0.2em] px-6"
            onClick={handleRevokeOthers}
            isLoading={revokingOthers}
          >
            Revoke Others
          </Button>
        )}
      </div>

      <div className="grid gap-6">
        <AnimatePresence mode="popLayout">
          {sessions.map((session) => {
            const Icon = getDeviceIcon(session.device);
            return (
              <motion.div 
                layout
                key={session.session_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 lg:p-8 rounded-[32px] border transition-all",
                  session.is_current 
                    ? "bg-slate-900 border-slate-900 text-white shadow-2xl shadow-slate-900/20" 
                    : "bg-white border-slate-50 hover:border-slate-200 shadow-sm hover:shadow-xl hover:shadow-slate-200/50"
                )}
              >
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "h-16 w-16 rounded-[20px] flex items-center justify-center transition-all duration-500",
                    session.is_current ? "bg-white/10 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
                  )}>
                    <Icon size={32} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <p className={cn("text-lg font-bold tracking-tight", session.is_current ? "text-white" : "text-slate-900")}>
                        {session.device || "Secured Device"}
                      </p>
                      {session.is_current && (
                        <span className="flex items-center gap-1.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-[0.25em] px-2.5 py-1 rounded-full">
                          <Check size={10} strokeWidth={4} /> Current
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                      <span className={cn("flex items-center gap-2", session.is_current ? "text-slate-400" : "text-slate-500")}>
                        <MapPin size={14} className={session.is_current ? "text-slate-600" : "text-slate-300"} />
                        {session.city ? `${session.city}, ${session.country_code}` : "Private Location"}
                      </span>
                      <span className={cn("flex items-center gap-2", session.is_current ? "text-slate-400" : "text-slate-500")}>
                        <Clock size={14} className={session.is_current ? "text-slate-600" : "text-slate-300"} />
                        {session.is_current ? "Active now" : `Seen ${formatTime(session.last_seen_at)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {!session.is_current && (
                  <button 
                    onClick={() => handleRevoke(session.session_id)}
                    disabled={revokingId === session.session_id}
                    className="flex h-12 w-full animate-fade-in-up md:w-auto items-center justify-center gap-2 px-8 rounded-2xl bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 font-bold text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {revokingId === session.session_id ? (
                      <div className="h-4 w-4 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Terminate
                      </>
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
