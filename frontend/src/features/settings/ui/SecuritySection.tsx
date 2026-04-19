import { useState, useEffect } from "react";
import { Shield, KeyRound, Lock } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/shared/ui/FormControls";
import { fetchProfile } from "../api";
import { UserProfile } from "../types";
import { MfaSetupWizard } from "@/features/settings/ui/MfaSetupWizard";
import { MfaManagementModal } from "./MfaManagementModal";
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
      <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Analyzing posture...</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="space-y-1 border-b border-border pb-6">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Security Control</h2>
        <p className="text-muted-foreground text-xs font-medium">Configure advanced cryptographic safeguards.</p>
      </div>

      <div className="grid gap-px bg-border border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Password Item */}
        <div className="group flex items-center justify-between gap-4 p-4 bg-card transition-colors hover:bg-muted/30">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-foreground group-hover:text-background transition-all duration-300">
              <KeyRound size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Master Password</p>
              <p className="text-[11px] text-muted-foreground">Primary account access key.</p>
            </div>
          </div>
          <Button
            compact
            variant="outline"
            onClick={() => setShowPasswordModal(true)}
            className="rounded-lg px-4"
          >
            Update
          </Button>
        </div>

        {/* 2FA Item */}
        <div className="group flex items-center justify-between gap-4 p-4 bg-card transition-colors hover:bg-muted/30">
          <div className="flex items-center gap-4">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center transition-all duration-300",
              profile?.is_two_factor_enabled
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background"
            )}>
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Two-Factor Authentication</p>
                {profile?.is_two_factor_enabled && (
                  <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-success border border-success/20">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Verification via mobile authenticator.</p>
            </div>
          </div>
          <Button
            compact
            variant="outline"
            onClick={() => profile?.is_two_factor_enabled ? setShowManage(true) : setShowWizard(true)}
            className="rounded-lg px-4"
          >
            {profile?.is_two_factor_enabled ? "Configure" : "Enable"}
          </Button>
        </div>
      </div>

      {/* Security Tip */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex items-start gap-3">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background shadow-sm text-foreground">
          <Lock size={12} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">Pro-Active Safety</p>
          <p className="text-[11px] font-medium leading-relaxed text-muted-foreground/80">
            ChitChat employs Zero-Trust architecture. Rotate your master password every 90 days.
          </p>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      {showWizard && (
        <MfaSetupWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false);
            loadProfile();
          }}
        />
      )}

      {showManage && (
        <MfaManagementModal
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
