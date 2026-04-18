import { useEffect, useState } from "react";
import { Activity, Laptop, Smartphone, Monitor, MapPin, ShieldCheck, Trash2, Clock } from "lucide-react";

import { fetchSessions, revokeSession, revokeOtherSessions } from "../api";
import { AuthSession } from "../types";
import { Button } from "@/shared/ui/FormControls";

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
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
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
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="h-10 w-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium">Synchronizing session state...</p>
      </div>
    );
  }

  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">Active Sessions</h2>
          <p className="text-slate-500 text-sm">Monitor and manage the devices currently logged into your account.</p>
        </div>
        {otherSessions.length > 0 && (
          <Button 
            variant="outline" 
            className="text-red-600 hover:bg-red-50 hover:border-red-100 border-red-50 text-xs font-bold px-4"
            onClick={handleRevokeOthers}
            isLoading={revokingOthers}
          >
            Revoke All Others
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {sessions.map((session) => {
          const Icon = getDeviceIcon(session.device);
          return (
            <div 
              key={session.session_id}
              className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-[24px] border-2 transition-all ${
                session.is_current 
                  ? 'bg-sky-50/30 border-sky-100 hover:border-sky-200' 
                  : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-5">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-colors ${
                  session.is_current ? 'bg-sky-100 text-sky-600' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-900'
                }`}>
                  <Icon size={28} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{session.device || "Unknown Device"}</p>
                    {session.is_current && (
                      <span className="flex items-center gap-1 bg-sky-200/50 text-sky-700 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                        <ShieldCheck size={10} /> This Device
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-slate-300" />
                      {session.city ? `${session.city}, ${session.country_code}` : "Location Unknown"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-300" />
                      Last seen {formatTime(session.last_seen_at)}
                    </span>
                  </div>
                </div>
              </div>

              {!session.is_current && (
                <button 
                  onClick={() => handleRevoke(session.session_id)}
                  disabled={revokingId === session.session_id}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-600 font-bold text-sm transition-all disabled:opacity-50"
                >
                  {revokingId === session.session_id ? (
                    <div className="h-4 w-4 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      {sessions.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
             <Activity size={40} />
          </div>
          <p className="text-slate-500 font-medium tracking-tight">No active sessions found. This is unusual.</p>
        </div>
      )}
    </div>
  );
}
