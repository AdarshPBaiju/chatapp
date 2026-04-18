import { useState, useEffect } from "react";
import { Shield, KeyRound, Check, Lock } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/shared/ui/FormControls";
import { fetchProfile } from "../api";
import { UserProfile } from "../types";
import { TwoFactorWizard } from "@/features/settings/ui/TwoFactorWizard";
import { TwoFactorManageModal } from "./TwoFactorManageModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { cn } from "@/shared/lib/utils";

export function SecuritySection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [showManage, setShowManage] = useState(false);
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

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="h-10 w-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">Analyzing posture...</p>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="space-y-2 border-b border-slate-50 pb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Security Vault</h2>
        <p className="text-slate-500 text-sm font-medium tracking-wide">Protect your digital identity with advanced cryptographic safeguards.</p>
      </div>

      <div className="grid gap-8">
        {/* Password Card */}
        <div className="group relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-[32px] border border-slate-50 bg-white hover:border-slate-200 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500">
          <div className="flex items-center gap-6">
            <div className="h-16 w-16 rounded-[22px] bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
              <KeyRound size={28} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold tracking-tight text-slate-900">Master Password</p>
              <p className="text-xs font-medium text-slate-500">Control your primary account access key.</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setShowPasswordModal(true)} 
            className="rounded-2xl border-slate-100 px-8 py-5 text-[11px] font-black uppercase tracking-widest"
          >
            Update Key
          </Button>
        </div>

        {/* 2FA Card */}
        <div className={cn(
          "group relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-[32px] border transition-all duration-500",
          profile?.is_two_factor_enabled 
            ? "bg-slate-900 border-slate-900 text-white shadow-2xl shadow-slate-900/20" 
            : "bg-white border-slate-50 hover:border-slate-200 hover:shadow-2xl hover:shadow-slate-200/50"
        )}>
          <div className="flex items-center gap-6">
            <div className={cn(
              "h-16 w-16 rounded-[22px] flex items-center justify-center transition-all duration-500",
              profile?.is_two_factor_enabled 
                ? "bg-white/10 text-white" 
                : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
            )}>
              <Shield size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                 <p className={cn("text-lg font-bold tracking-tight", profile?.is_two_factor_enabled ? "text-white" : "text-slate-900")}>
                   Two-Factor Protocol
                 </p>
                 {profile?.is_two_factor_enabled && (
                   <span className="flex items-center gap-1.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-[0.25em] px-2.5 py-1 rounded-full">
                     <Check size={10} strokeWidth={4} /> Hardened
                   </span>
                 )}
              </div>
              <p className={cn("text-xs font-medium", profile?.is_two_factor_enabled ? "text-slate-400" : "text-slate-500")}>
                Multi-layer verification via mobile authenticator.
              </p>
            </div>
          </div>
          <Button 
            variant={profile?.is_two_factor_enabled ? "link" : "outline"} 
            onClick={() => profile?.is_two_factor_enabled ? setShowManage(true) : setShowWizard(true)} 
            className={cn(
              "rounded-2xl px-8 py-5 text-[11px] font-black uppercase tracking-widest transition-all",
              profile?.is_two_factor_enabled 
                ? "text-white hover:text-emerald-400" 
                : "border-slate-100"
            )}
          >
            {profile?.is_two_factor_enabled ? "Auth Protocol Settings" : "Deploy 2FA"}
          </Button>
        </div>
      </div>

      {/* Security Tip */}
      <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 flex items-start gap-4">
         <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
           <Lock size={12} />
         </div>
         <div className="space-y-1">
           <p className="text-xs font-bold uppercase tracking-widest text-slate-900">Pro-Active Safety</p>
           <p className="text-xs font-medium leading-relaxed text-slate-500">
             ChitChat employs Zero-Trust architecture. We recommend rotating your master password every 90 days and maintaining an active 2FA device.
           </p>
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

      {showManage && (
        <TwoFactorManageModal
          onClose={() => setShowManage(false)}
          onSuccess={() => {
            setShowManage(false);
            loadProfile();
          }}
        />
      )}
    </motion.div>
  );
}
