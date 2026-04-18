import { useState, useEffect } from "react";
import { Shield, ShieldAlert, KeyRound, Smartphone, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/shared/ui/FormControls";
import { fetchProfile } from "../api";
import { UserProfile } from "../types";
import { TwoFactorWizard } from "@/features/settings/ui/TwoFactorWizard";

export function SecuritySection() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setIsLoading(true);
      const data = await fetchProfile();
      if (data.success) {
        setProfile(data.data);
      }
    } catch (err) {
      // Error handled by state
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <div className="p-8 text-center text-slate-500">Evaluating security posture...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">Security Center</h2>
        <p className="text-slate-500">Manage your credentials and advanced identity protection.</p>
      </div>

      <div className="grid gap-6">
        {/* Password Card */}
        <div className="group bg-white border-2 border-slate-100 rounded-2xl p-6 hover:border-sky-500 transition-all flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
              <KeyRound size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-900">Account Password</p>
              <p className="text-sm text-slate-500">Last updated recently</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/change-password")} className="gap-2">
            Change <ChevronRight size={16} />
          </Button>
        </div>

        {/* 2FA Card */}
        <div className={`group border-2 rounded-2xl p-6 transition-all ${
          profile?.is_two_factor_enabled 
            ? 'bg-emerald-50/30 border-emerald-100 border-dashed hover:border-emerald-300' 
            : 'bg-white border-slate-100 hover:border-sky-500'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
                profile?.is_two_factor_enabled 
                  ? 'bg-emerald-100 text-emerald-600' 
                  : 'bg-slate-50 text-slate-600 group-hover:bg-sky-50 group-hover:text-sky-600'
              }`}>
                <Smartphone size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-900">Two-Factor Authentication (TOTP)</p>
                  {profile?.is_two_factor_enabled ? (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Active</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Recommended</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">Secure your account with a mobile authenticator app</p>
              </div>
            </div>
            
            {profile?.is_two_factor_enabled ? (
              <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:border-red-100">
                Disable MFA
              </Button>
            ) : (
              <Button onClick={() => setShowWizard(true)} className="gap-2 shadow-lg shadow-sky-500/10">
                <Shield size={18} /> Enable 2FA
              </Button>
            )}
          </div>

          {!profile?.is_two_factor_enabled && (
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-4">
              <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 leading-relaxed">
                Adding an extra layer of security helps ensure that you're the only one who can access your account, even if someone else knows your password.
              </p>
            </div>
          )}
        </div>
      </div>

      {showWizard && (
        <TwoFactorWizard 
          onClose={() => setShowWizard(false)} 
          onSuccess={() => {
            setShowWizard(false);
            loadProfile();
          }}
        />
      )}
    </div>
  );
}
