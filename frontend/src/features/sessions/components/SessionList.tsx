import { formatRelativeTime } from "@/shared/lib/date";
import { SessionInfo } from "@/features/auth/types";
import { Monitor, Smartphone, Laptop, Globe, LogOut } from "lucide-react";
import { Button } from "@/shared/ui/FormControls";
import { cn } from "@/shared/lib/utils";

type SessionListProps = {
  sessions: SessionInfo[];
  onRevoke: (sessionId: string) => void;
  disabled?: boolean;
  allowCurrentRevoke?: boolean;
};

const getDeviceIcon = (device: string) => {
  const d = device.toLowerCase();
  if (d.includes("iphone") || d.includes("android") || d.includes("mobile")) return <Smartphone size={24} />;
  if (d.includes("mac") || d.includes("windows") || d.includes("linux")) return <Laptop size={24} />;
  return <Monitor size={24} />;
};

export function SessionList({
  sessions,
  onRevoke,
  disabled = false,
  allowCurrentRevoke = false,
}: SessionListProps) {
  if (!sessions.length) {
    return (
      <div className="text-center py-12">
        <Globe className="mx-auto text-white/10 mb-4" size={48} />
        <p className="text-[var(--muted)]">No active sessions found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <div 
          key={session.session_id} 
          className={cn(
            "group relative flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-white/5 border border-white/5 rounded-2xl transition-all duration-300 hover:bg-white/10 hover:border-white/10",
            session.is_current && "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20"
          )}
        >
          <div className="flex items-center gap-5">
            <div className={cn(
              "p-4 rounded-xl",
              session.is_current ? "bg-[var(--color-primary)] text-white" : "bg-white/5 text-[var(--muted)] group-hover:text-white"
            )}>
              {getDeviceIcon(session.device)}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg text-white">{session.device}</p>
                {session.is_current && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-[var(--color-primary)]/20">
                    Current
                  </span>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                {(session.city || session.country_code) && (
                  <span className="flex items-center gap-1.5">
                    <Globe size={14} />
                    {[session.city, session.country_code].filter(Boolean).join(", ")}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  Active {formatRelativeTime(session.last_seen_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 sm:mt-0">
            <Button
              variant={session.is_current ? "outline" : "outline"}
              onClick={() => onRevoke(session.session_id)}
              disabled={disabled || (session.is_current && !allowCurrentRevoke)}
              className={cn(
                "group/btn w-full sm:w-auto py-2.5 px-6 !rounded-xl text-xs uppercase tracking-tight font-black transition-all duration-300",
                !session.is_current && "hover:border-red-500/50 hover:text-red-500 hover:bg-red-500/5"
              )}
            >
              {!session.is_current && <LogOut size={14} className="transition-transform group-hover/btn:-translate-x-0.5" />}
              {session.is_current ? "Current Device" : "Logout"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
