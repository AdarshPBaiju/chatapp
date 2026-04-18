import { useState, useEffect } from "react";
import { Shield, KeyRound, ChevronRight, Check } from "lucide-react";

import { Button } from "@/shared/ui/FormControls";
import { fetchProfile } from "../api";
import { UserProfile } from "../types";
import { TwoFactorWizard } from "@/features/settings/ui/TwoFactorWizard";
import { ChangePasswordModal } from "./ChangePasswordModal";

export function SecuritySection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setIsLoading(true);
      const res = await fetchProfile();
      if (res.success) {
        setProfile(res.data);
      }
    } catch (err) {
      console.error("Failed to load security profile", err);
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
          <Button variant="outline" onClick={() => setShowPasswordModal(true)} className="gap-2">
            Change <ChevronRight size={16} />
          </Button>
        </div>

        {/* 2FA Card */}
        <div className="group bg-white border-2 border-slate-100 rounded-2xl p-6 hover:border-sky-500 transition-all flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
              profile?.is_two_factor_enabled 
                ? "bg-emerald-50 text-emerald-600" 
                : "bg-slate-50 text-slate-600 group-hover:bg-sky-50 group-hover:text-sky-600"
            }`}>
              <Shield size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-900">Two-Factor Authentication</p>
              <div className="flex items-center gap-2">
                {profile?.is_two_factor_enabled ? (
                  <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <Check size={14} /> Enabled
                  </span>
                ) : (
                  <p className="text-sm text-slate-500">Security enhanced with OTP</p>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowWizard(true)} className="gap-2">
            {profile?.is_two_factor_enabled ? "Manage" : "Configure"} <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

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
