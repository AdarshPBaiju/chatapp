import { FormEvent, useState } from "react";
import { Lock, CheckCircle, ShieldAlert } from "lucide-react";

import { changePassword } from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Modal } from "@/shared/ui/Modal";
import { Button, Input } from "@/shared/ui/FormControls";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await changePassword({
        old_password: oldPassword,
        password,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(readApiMessage(err, "Failed to change password."));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    // Reset state before closing
    if (success) {
        setOldPassword("");
        setPassword("");
        setConfirmPassword("");
        setSuccess(false);
    }
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Change Password" maxWidth="md">
      {success ? (
        <div className="space-y-8 py-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center gap-6 rounded-[28px] border-2 border-emerald-100 bg-emerald-50/30 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 shadow-xl shadow-emerald-500/10">
              <CheckCircle className="text-emerald-700" size={40} />
            </div>
            <div className="space-y-1">
              <p className="text-xl font-bold text-slate-900">Password Updated</p>
              <p className="text-sm text-slate-600 leading-relaxed">Your new security credentials are now active and all other sessions have been refreshed.</p>
            </div>
          </div>
          <Button onClick={handleClose} className="w-full py-4 text-emerald-700 bg-emerald-100 border-2 border-emerald-200 hover:bg-emerald-200 shadow-none">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-8 py-2">
          <div className="flex items-start gap-4 rounded-2xl border-2 border-sky-100 bg-sky-50/50 p-4">
            <ShieldAlert className="shrink-0 text-sky-700 mt-0.5" size={24} />
            <p className="text-sm leading-relaxed text-slate-600">
              Enter your current password to verify your identity before setting a new one.
            </p>
          </div>

          <Input
            type="password"
            label="Current Password"
            placeholder="Enter current password"
            icon={<Lock size={20} />}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            disabled={loading}
          />

          <div className="space-y-6 pt-2">
            <Input
              type="password"
              label="New Password"
              placeholder="Minimum 8 characters"
              icon={<Lock size={20} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            <Input
              type="password"
              label="Confirm New Password"
              placeholder="Repeat new password"
              icon={<Lock size={20} />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              error={error}
            />
          </div>

          <Button type="submit" className="w-full py-4 shadow-xl shadow-sky-500/10" isLoading={loading}>
             Update Security Credentials
          </Button>
        </form>
      )}
    </Modal>
  );
}
