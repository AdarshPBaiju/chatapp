import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ShieldAlert } from "lucide-react";

import { useAuthStore } from "@/features/auth/state";
import { fetchSessionsFlow, revokeSessionFlow, revokeOthersFlow } from "@/features/sessions/flows";
import { SessionList } from "@/features/sessions/components/SessionList";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button } from "@/shared/ui/FormControls";

export function SessionGatePage() {
  const navigate = useNavigate();
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const sessions = (useAuthStore((state) => state.restrictedSessions) || []).filter((s) => !s.is_current);
  const status = useAuthStore((state) => state.status);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchSessionsFlow().catch((e) => {
      // If it's a 401, the global interceptor handles the logout/redirect.
      // We don't want to show a confusing technical error message on the screen.
      if (e?.response?.status !== 401) {
        setError(readApiMessage(e, "Failed to load sessions."));
      }
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

  const handleLogout = () => {
    setAnonymous();
    navigate("/login");
  };

  return (
    <AuthLayout 
      heading="Device Limit Reached" 
      subheading="You have too many active devices. Revoke one to continue."
      isWide
    >
      <div className="space-y-8">
        {sessions.length > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-8 bg-[#f59e0b]/5 border border-[#f59e0b]/10 rounded-3xl group/notice overflow-hidden relative animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/5 to-transparent opacity-0 group-hover/notice:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center gap-5 relative z-10">
              <div className="p-4 bg-[#f59e0b]/10 text-[#f59e0b] rounded-2xl shadow-inner">
                <ShieldAlert size={28} />
              </div>
              <div className="space-y-1">
                <p className="font-black text-[#f59e0b] tracking-wide uppercase text-xs">Security Notice</p>
                <p className="text-[#f59e0b]/70 font-medium">Revoking sessions will immediately log those devices out.</p>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              className="relative z-10 border-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/10 hover:border-[#f59e0b]/40 rounded-xl py-2 px-4 text-xs font-black uppercase tracking-tight"
              onClick={onRevokeAllOthers}
              disabled={loading}
              leftIcon={<LogOut size={14} />}
            >
              Logout All Other Devices
            </Button>
          </div>
        )}

        {error && (
          <div className="p-5 bg-red-500/10 border border-red-500/10 rounded-2xl text-red-500 text-sm font-bold animate-shake">
            {error}
          </div>
        )}

        <div className="max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
          <SessionList sessions={sessions} onRevoke={onRevoke} disabled={loading} />
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col items-center gap-4">
          <Button 
            variant="link"
            onClick={handleLogout}
            leftIcon={<LogOut size={20} className="transition-transform group-hover/logout:-translate-x-1" />}
            className="group/logout text-[#5e5a75] hover:text-white transition-all duration-300 font-bold px-6 py-3 tracking-normal uppercase-none"
          >
            Not you? Sign out and use another account
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
