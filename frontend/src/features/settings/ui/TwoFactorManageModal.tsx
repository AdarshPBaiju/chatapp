import { useState } from "react";
import { ShieldAlert, Lock } from "lucide-react";
import { Button, Input } from "@/shared/ui/FormControls";
import { Modal } from "@/shared/ui/Modal";
import { disableTwoFactor } from "../api";
import { toast } from "@/shared/ui/Toast";

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
        toast.info("Two-factor authentication disabled.");
        onSuccess();
      } else {
        setError(res.message);
      }
    } catch (err) {
      toast.error("Failed to disable protection.");
      setError("Please check your password and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Disable 2FA" maxWidth="sm">
      <div className="space-y-4 text-center">
        <div className="h-12 w-12 bg-destructive/10 text-destructive rounded-xl flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert size={24} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Confirm your identity to disable two-factor protection.
          </p>
        </div>
        
        <div className="text-left space-y-2">
          <Input 
            compact
            type="password"
            icon={<Lock size={16} />}
            placeholder="Account Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-[10px] font-bold text-destructive text-center uppercase tracking-wider">{error}</p>}
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button compact variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button 
            compact
            onClick={handleDisable} 
            isLoading={isLoading} 
            disabled={!password || isLoading}
            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive shadow-none"
          >
            Disable
          </Button>
        </div>
      </div>
    </Modal>
  );
}
