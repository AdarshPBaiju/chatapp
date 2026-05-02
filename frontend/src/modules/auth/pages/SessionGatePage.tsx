import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ShieldAlert, Laptop, Smartphone } from "lucide-react";

import { useAuthStore } from "@/modules/auth/state/authState";
import { fetchSessionsFlow, revokeSessionFlow, revokeOthersFlow } from "@/features/sessions/flows";
import { getErrorMessage } from "@/shared/lib/errorHelper";
import { toast } from "@/shared/ui/Toast";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button } from "@/shared/ui/FormControls";

export function SessionGatePage() {
  const navigate = useNavigate();
  const setAnonymous = useAuthStore((state) => state.setAnonymous);
  const sessions = useAuthStore((state) => state.restrictedSessions) || [];
  const otherSessions = sessions.filter((s) => !s.is_current);
  const status = useAuthStore((state) => state.status);

  const [loading, setLoading] = useState<string | boolean>(false);

  useEffect(() => {
    void fetchSessionsFlow();
  }, []);

  useEffect(() => {
    if (status === "full") navigate("/app/chats");
  }, [status, navigate]);

  async function onRevoke(sessionId: string) {
    setLoading(sessionId);
    try {
      await revokeSessionFlow(sessionId);
    } catch (e) {
      toast.error(getErrorMessage(e, "Revoke failed."));
    } finally {
      setLoading(false);
    }
  }

  async function onRevokeOthers() {
    setLoading("others");
    try {
      await revokeOthersFlow();
      toast.success("Other sessions revoked.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Revoke others failed."));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setAnonymous();
    navigate("/auth?mode=login");
  }

  return (
    <AuthLayout
      heading="Review sessions"
      subheading="You reached the device limit. Revoke a session to continue."
    >
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
          <ShieldAlert className="shrink-0 text-slate-400 mt-0.5" size={16} />
          <p className="text-[12px] font-bold text-slate-500 leading-relaxed">
            Revoke one session below to access your account on this device.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Other Devices</span>
            {otherSessions.length > 1 && (
              <button 
                onClick={onRevokeOthers}
                disabled={!!loading}
                className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                Revoke All
              </button>
            )}
          </div>

          <div className="space-y-3">
            {otherSessions.map((session) => (
              <div
                key={session.session_id}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-100/50 border border-slate-200/50 transition-all hover:bg-white hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/50 text-slate-600">
                    {session.device?.toLowerCase().includes("phone") ? <Smartphone size={18} /> : <Laptop size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-black text-slate-800">
                        {session.device || "Unknown Device"}
                      </h3>
                      {session.is_current && (
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[10px] font-black text-blue-500 uppercase">Current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {session.city || "Unknown City"}, {session.country_code}
                      </p>
                      <span className="text-slate-200 text-[10px]">•</span>
                      <p className="text-[10px] font-mono font-medium text-slate-400">
                        {session.ip_address}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="social"
                  className="h-9 w-9 p-0 rounded-lg text-red-500 hover:bg-red-50 hover:border-red-100"
                  onClick={() => onRevoke(session.session_id)}
                  isLoading={loading === session.session_id}
                >
                  {loading !== session.session_id && <LogOut size={14} />}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <Button variant="link" className="w-full text-slate-400 hover:text-slate-900" onClick={handleLogout}>
            Use a different account
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
