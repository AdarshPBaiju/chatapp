import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { resendOtp } from "@/features/auth/api";
import { runOtpValidationFlow } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";

export function OtpPage() {
  const navigate = useNavigate();
  const pending = useAuthStore((state) => state.pendingVerification);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(pending?.resend_interval || 0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;

    setError(undefined);
    setLoading(true);
    try {
      await runOtpValidationFlow(pending.user_id, otpCode);
      const status = useAuthStore.getState().status;
      if (status === "full") navigate("/dashboard");
      if (status === "restricted") navigate("/session-gate");
    } catch (e) {
      setError(readApiMessage(e, "OTP validation failed."));
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!pending || countdown > 0) return;
    setResendLoading(true);
    setError(undefined);
    try {
      await resendOtp({ user_id: pending.user_id });
      setCountdown(pending.resend_interval || 60);
    } catch (e) {
      setError(readApiMessage(e, "Failed to resend OTP."));
    } finally {
      setResendLoading(false);
    }
  }

  if (!pending) {
    return null;
  }

  return (
    <AuthLayout heading="Verify Identity">
      <form onSubmit={onSubmit} className="space-y-6">
        <p className="text-[var(--muted)]">
          Enter the 6-digit code sent to <strong className="text-white">{pending.email}</strong>
        </p>
        <Input
          type="text"
          placeholder="6-digit code"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          minLength={6}
          maxLength={6}
          required
          disabled={loading}
          error={error}
        />
        <div className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={loading}>
            Verify
          </Button>
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-[var(--muted)] hover:text-white transition-colors disabled:opacity-50"
              onClick={onResend}
              disabled={resendLoading || countdown > 0}
            >
              {resendLoading ? "Resending..." : countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
            </button>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}
