import { useState } from "react";
import { ShieldAlert, Lock } from "lucide-react";
import { Button, Input } from "@/shared/ui/FormControls";
import { disableTwoFactor } from "../api";

interface TwoFactorManageModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function TwoFactorManageModal({ onClose, onSuccess }: TwoFactorManageModalProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisable() {
    if (!password) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await disableTwoFactor(password);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.message);
      }
    } catch {
      setError("Failed to disable 2FA. Please check your password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6 text-center border border-border">
        <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-foreground">Disable 2FA</h3>
          <p className="text-sm text-muted-foreground">
            To disable two-factor authentication, please confirm your password.
          </p>
        </div>
        
        <div className="text-left space-y-2">
          <Input 
            type="password"
            icon={<Lock size={18} />}
            placeholder="Account Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm font-bold text-destructive text-center">{error}</p>}
        </div>
        
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button 
            onClick={handleDisable} 
            isLoading={isLoading} 
            disabled={!password || isLoading}
            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-[120px]"
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}
