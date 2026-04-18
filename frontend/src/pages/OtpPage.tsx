import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ArrowLeft } from "lucide-react";

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
      if (status === "full") navigate("/settings/profile");
      if (status === "restricted") navigate("/auth/active-sessions");
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
    <AuthLayout
      heading="Verify access"
      subheading="Enter the 6-digit code sent to your email to continue."
    >
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="flex flex-col items-center gap-1 rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sent to</span>
          <span className="font-semibold text-slate-950">{pending.email}</span>
        </div>

        <Input
          type="text"
          label="Verification Code"
          placeholder="123456"
          icon={<CheckCircle size={22} />}
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          minLength={6}
          maxLength={6}
          required
          disabled={loading}
          error={error}
        />

        <div className="flex flex-col gap-4 pt-2">
          <Button type="submit" className="w-full py-4" isLoading={loading}>
            Verify Code
          </Button>

          <div className="text-center pt-1">
            <Button
              type="button"
              variant="link"
              className="text-sm"
              onClick={onResend}
              disabled={countdown > 0}
              isLoading={resendLoading}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend Verification Code"}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
