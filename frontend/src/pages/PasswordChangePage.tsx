import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, CheckCircle, ShieldAlert } from "lucide-react";

import { changePassword } from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";

export function PasswordChangePage() {
  const navigate = useNavigate();
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

  if (success) {
    return (
      <AuthLayout heading="Password updated" subheading="Your new credentials are now active.">
        <div className="space-y-8 py-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-6 rounded-[28px] border border-slate-200 bg-slate-50 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
              <CheckCircle className="text-sky-700" size={40} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold leading-tight text-slate-950">Password Updated</p>
              <p className="text-sm text-slate-600">Your new security credentials are active.</p>
            </div>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="w-full py-4">
            Go to Dashboard
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Update password" subheading="Confirm your current password before setting a new one.">
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="flex items-center gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <ShieldAlert className="shrink-0 text-sky-700" size={24} />
          <p className="text-sm leading-6 text-slate-600">
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

        <Button type="submit" className="w-full py-4" isLoading={loading}>
          Confirm Update
        </Button>
      </form>
    </AuthLayout>
  );
}
