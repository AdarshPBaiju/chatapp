import { useState } from "react";
import { Copy, Download, Check, Shield, Smartphone } from "lucide-react";

import { Button, Input } from "@/shared/ui/FormControls";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-card rounded-3xl shadow-2xl shadow-primary/20 overflow-hidden outline-none border border-border">
        <div className="p-8">
          {step === 1 && (
            <div className="space-y-6 text-center py-4">
              <div className="h-20 w-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto">
                <Shield size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">Secure Your Account</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Two-factor authentication adds an extra layer of security by requiring a code from your phone when you log in.
                </p>
              </div>
              <div className="pt-4 flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button onClick={handleStart} isLoading={isLoading} className="flex-1">Get Started</Button>
              </div>
            </div>
          )}

          {step === 2 && setupData && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-foreground">Scan QR Code</h3>
                <p className="text-sm text-muted-foreground">Open your authenticator app and scan this code.</p>
              </div>
              
              <div className="bg-muted p-6 rounded-2xl flex items-center justify-center border-2 border-border border-dashed">
                <div className="rounded-lg shadow-sm bg-white p-2">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.provisioning_uri)}`}
                    alt="QR Code"
                    className="block"
                  />
                </div>
              </div>

              <div className="p-4 bg-primary/10 rounded-xl space-y-1">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Manual Entry Code</p>
                <p className="font-mono text-lg font-bold text-foreground tracking-widest">{setupData.secret}</p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button onClick={() => setStep(3)} className="flex-1">Already Scanned</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-foreground">Verify Setup</h3>
                <p className="text-sm text-muted-foreground">Enter the 6-digit code currently shown in your app.</p>
              </div>

              <div className="py-4">
                <Input
                  icon={<Smartphone size={20} />}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="text-center text-3xl font-mono tracking-[0.5em]"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm font-bold text-destructive text-center">{error}</p>}

              <div className="pt-4 flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
                <Button 
                  onClick={handleVerify} 
                  isLoading={isLoading} 
                  disabled={verificationCode.length !== 6 || isLoading}
                  className="flex-1"
                >
                  Verify & Activate
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="h-16 w-16 bg-success/10 text-success rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-foreground">Backup Codes</h3>
                <p className="text-sm text-muted-foreground">Keep these codes in a safe place. They are your only way back if you lose your phone.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-6 bg-muted rounded-2xl border-2 border-border font-mono text-sm leading-relaxed">
                {backupCodes.map((code, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-muted-foreground/30 pointer-events-none font-bold">{String(idx + 1).padStart(2, '0')}.</span>
                    <span className="text-foreground font-bold">{code}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCopyCodes} className="flex-1 gap-2">
                  {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? "Copied" : "Copy All"}
                </Button>
                <Button variant="outline" onClick={handleDownloadCodes} className="flex-1 gap-2">
                  <Download size={18} /> Download
                </Button>
              </div>

              <div className="pt-4">
                <Button onClick={onSuccess} className="w-full bg-success text-success-foreground hover:bg-success/90 shadow-lg shadow-success/10">
                  Finish Setup
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
