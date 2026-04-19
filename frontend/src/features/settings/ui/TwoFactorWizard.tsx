import { useState } from "react";
import { Copy, Download, Check, Shield, Smartphone } from "lucide-react";

import { Button, Input } from "@/shared/ui/FormControls";
import { Modal } from "@/shared/ui/Modal";
import { setupTwoFactor, verifyTwoFactor } from "../api";
import { TwoFactorSetup } from "../types";

interface TwoFactorWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function TwoFactorWizard({ onClose, onSuccess }: TwoFactorWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleStart() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await setupTwoFactor();
      if (data.success) {
        setSetupData(data.data);
        setStep(2);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Failed to initialize 2FA setup.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await verifyTwoFactor(verificationCode);
      if (data.success && data.data) {
        setBackupCodes(data.data.backup_codes);
        setStep(4);
      } else {
        setError(data.message || "Verification failed.");
      }
    } catch (err) {
      setError("Verification failed. Please check the code.");
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
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chitchat-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const titles = {
    1: "Secure Your Account",
    2: "Scan QR Code",
    3: "Verify Setup",
    4: "Backup Codes"
  };

  return (
    <Modal 
      isOpen={true} 
      onClose={onClose} 
      title={titles[step as keyof typeof titles]} 
      maxWidth="md"
    >
      <div className="py-2">
        {step === 1 && (
          <div className="space-y-4 text-center py-2">
            <div className="h-14 w-14 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto shadow-sm">
              <Shield size={28} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Two-factor authentication adds an extra layer of security requiring a code from your device.
              </p>
            </div>
            <div className="pt-4 flex gap-2">
              <Button compact variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button compact onClick={handleStart} isLoading={isLoading} className="flex-1">Get Started</Button>
            </div>
          </div>
        )}

        {step === 2 && setupData && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-[11px] text-muted-foreground">Open your authenticator app and scan this code.</p>
            </div>
            
            <div className="bg-muted p-4 rounded-xl flex items-center justify-center border border-border border-dashed">
              <div className="rounded-lg shadow-sm bg-white p-2">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(setupData.provisioning_uri)}`}
                  alt="QR Code"
                  className="block w-40 h-40"
                />
              </div>
            </div>

            <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 space-y-1 overflow-hidden">
              <p className="text-[9px] font-bold text-primary uppercase tracking-wider">Manual Entry Code</p>
              <p className="font-mono text-base font-bold text-foreground tracking-wider break-all leading-relaxed">{setupData.secret}</p>
            </div>

            <div className="pt-2 flex gap-2">
              <Button compact variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button compact onClick={() => setStep(3)} className="flex-1">Next Step</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-[11px] text-muted-foreground">Enter the 6-digit code from your app.</p>
            </div>

            <div className="py-2">
              <Input
                compact
                icon={<Smartphone size={16} />}
                placeholder="000 000"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="text-center text-2xl font-mono tracking-[0.3em]"
                autoFocus
              />
            </div>

            {error && <p className="text-[10px] font-bold text-destructive text-center uppercase tracking-wider">{error}</p>}

            <div className="pt-2 flex gap-2">
              <Button compact variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
              <Button 
                compact
                onClick={handleVerify} 
                isLoading={isLoading} 
                disabled={verificationCode.length !== 6 || isLoading}
                className="flex-1"
              >
                Verify
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <div className="h-12 w-12 bg-success/10 text-success rounded-xl flex items-center justify-center mx-auto mb-2 shadow-sm">
                <Check size={24} />
              </div>
              <p className="text-[11px] text-muted-foreground">Store these in a safe place. They are your one-time recovery keys.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-xl border border-border font-mono text-[10px] leading-relaxed">
              {backupCodes.map((code, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-muted-foreground/30 pointer-events-none font-bold">{String(idx + 1).padStart(2, '0')}.</span>
                  <span className="text-foreground font-bold">{code}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button compact variant="outline" onClick={handleCopyCodes} className="flex-1 gap-2">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button compact variant="outline" onClick={handleDownloadCodes} className="flex-1 gap-2">
                <Download size={14} /> Download
              </Button>
            </div>

            <div className="pt-2">
              <Button compact onClick={onSuccess} className="w-full bg-success text-success-foreground hover:bg-success shadow-none">
                Finish Setup
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
