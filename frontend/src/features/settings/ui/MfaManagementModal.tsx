import { useState } from "react";
import { Copy, Download, Check, ShieldOff, Eye, EyeOff } from "lucide-react";

import { Button } from "@/shared/ui/FormControls";
import { Modal } from "@/shared/ui/Modal";
import { alertDialog } from "@/shared/ui/AlertDialog";
import { getBackupCodes, disableTwoFactor } from "../api";
import { toast } from "@/shared/ui/Toast";

interface MfaManagementModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type ViewState = "menu" | "verify" | "backup_codes" | "disable";

export function MfaManagementModal({ onClose, onSuccess }: MfaManagementModalProps) {
  const [view, setView] = useState<ViewState>("menu");
  const [pendingAction, setPendingAction] = useState<"backup" | "disable" | null>(null);
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function selectAction(action: "backup" | "disable") {
    setPendingAction(action);
    setError(null);
    setView("verify");
  }

  async function handleVerify() {
    if (!password) {
      setError("Password is required.");
      return;
    }

    if (pendingAction === "backup") {
      await handleGetBackupCodes();
    } else if (pendingAction === "disable") {
      setView("disable");
    }
  }

  async function handleGetBackupCodes() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getBackupCodes(password);
      if (data.success && data.data) {
        setBackupCodes(data.data.backup_codes);
        setView("backup_codes");
        setPassword("");
      } else {
        setError(data.message || "Authentication failed.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisable() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await disableTwoFactor(password);
      if (data.success) {
        toast.success("Two-factor authentication disabled.");
        onSuccess();
      } else {
        setError(data.message || "Disabling failed.");
        setView("verify"); // Go back and show error
      }
    } catch (err) {
      setError("An unexpected error occurred.");
      setView("verify");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopyCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadCodes() {
    const content = [
      "ChitChat Recovery Keys",
      "======================",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Store these in a secure location. Each code can only be used once.",
      "",
      ...backupCodes.map((code, i) => `${String(i + 1).padStart(2, "0")}. ${code}`),
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chitchat-recovery-keys.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Recovery keys downloaded.");
  }

  const titles = {
    menu: "Manage 2FA",
    verify: "Authentication Required",
    backup_codes: "Recovery Keys",
    disable: "Disable Protection"
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={titles[view]}
      maxWidth="sm"
      hideClose
    >
      <div className="py-2">
        {view === "menu" && (
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground text-center">
              Choose a security action to manage your account protection.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                compact
                onClick={() => selectAction("backup")}
                className="w-full justify-start gap-3 h-12 rounded-xl group"
                variant="outline"
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  <Download size={16} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-foreground">View Backup Codes</p>
                  <p className="text-[10px] text-muted-foreground">Access your recovery keys.</p>
                </div>
              </Button>

              <Button
                compact
                onClick={() => selectAction("disable")}
                className="w-full justify-start gap-3 h-12 rounded-xl group border-destructive/20 hover:bg-destructive/5"
                variant="outline"
              >
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground transition-all">
                  <ShieldOff size={16} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-destructive">Disable 2FA</p>
                  <p className="text-[10px] text-muted-foreground">Remove two-factor protection.</p>
                </div>
              </Button>
            </div>
          </div>
        )}

        {view === "verify" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-[11px] text-muted-foreground italic">
                Please enter your password to {pendingAction === "backup" ? "view recovery keys" : "proceed with deactivation"}.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-xl border border-border p-3 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Master Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Verify your identity"
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {error && <p className="text-[10px] font-bold text-destructive uppercase tracking-tight text-center">{error}</p>}
                </div>

                <div className="flex gap-2">
                  <Button compact variant="outline" onClick={() => setView("menu")} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    compact
                    onClick={handleVerify}
                    isLoading={isLoading}
                    className="flex-1"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "backup_codes" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-[11px] text-muted-foreground">Store these in a safe place. They are your one-time recovery keys.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-xl border border-border font-mono text-[10px] items-center italic">
              {backupCodes.map((code, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-muted-foreground/30 font-bold">{String(idx + 1).padStart(2, '0')}.</span>
                  <span className="text-foreground font-bold">{code}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Button compact variant="outline" onClick={handleCopyCodes} className="flex-1 gap-2">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy Keys"}
                </Button>
                <Button compact variant="outline" onClick={handleDownloadCodes} className="flex-1 gap-2">
                  <Download size={14} /> Download
                </Button>
              </div>
              <Button compact onClick={() => {
                alertDialog.show({
                  title: "Unsaved Recovery Keys",
                  message: "You haven't confirmed saving your keys. If you lose access, you will be locked out permanently.",
                  variant: "warning",
                  size: "md",
                  buttons: [
                    {
                      label: "Go Back",
                      variant: "ghost",
                      keyboardTrigger: "escape",
                      onClick: () => setView("menu")
                    },
                    {
                      label: "Stay Protected",
                      variant: "warning",
                      keyboardTrigger: "enter"
                    }
                  ]
                });
              }} className="w-full">
                Back to Menu
              </Button>
            </div>
          </div>
        )}

        {view === "disable" && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-2">
              <div className="h-12 w-12 bg-destructive/10 text-destructive rounded-xl flex items-center justify-center mx-auto mb-2">
                <ShieldOff size={24} />
              </div>
              <p className="text-sm font-bold text-foreground">Are you absolutely sure?</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed px-4 italic">
                Disabling two-factor authentication will significantly reduce your account's cryptographic safety.
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button compact variant="outline" onClick={() => setView("menu")} className="flex-1">
                Keep Protected
              </Button>
              <Button
                compact
                onClick={handleDisable}
                isLoading={isLoading}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive shadow-none"
              >
                Disable Now
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
