import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { resendOtp } from "@/features/auth/api";
import { runOtpValidationFlow } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

export function OtpPage() {
  const navigate = useNavigate();
  const pending = useAuthStore((state) => state.pendingVerification);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

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
    if (!pending) return;
    setResendLoading(true);
    setError(undefined);
    try {
      await resendOtp({ user_id: pending.user_id });
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
    <main className="container">
      <Card>
        <h1>Verify OTP</h1>
        <p>Enter the code sent to {pending.email}</p>
        <form className="stack" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="6-digit code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            minLength={6}
            maxLength={6}
            required
          />
          <FormError message={error} />
          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
        <button className="secondary" type="button" onClick={onResend} disabled={resendLoading}>
          {resendLoading ? "Resending..." : "Resend OTP"}
        </button>
      </Card>
    </main>
  );
}
