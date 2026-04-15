import { FormEvent, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";

type Step = "REQUEST" | "VERIFY" | "CONFIRM" | "SUCCESS";

export function PasswordResetPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("REQUEST");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendInterval, setResendInterval] = useState(60);
  const [countdown, setCountdown] = useState(0);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const data = await requestPasswordReset({ email });
      setResendInterval(data.resend_interval);
      setCountdown(data.resend_interval);
      setStep("VERIFY");
    } catch (err) {
      setError(readApiMessage(err, "Failed to send reset code."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError(undefined);
    try {
      await requestPasswordReset({ email });
      setCountdown(resendInterval);
    } catch (err) {
      setError(readApiMessage(err, "Resend failed."));
    }
  }

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const { reset_token } = await verifyPasswordResetOtp({ email, otp_code: otpCode });
      setResetToken(reset_token);
      setStep("CONFIRM");
    } catch (err) {
      setError(readApiMessage(err, "Invalid verification code."));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset({
        reset_token: resetToken,
        password,
        confirm_password: confirmPassword,
      });
      setStep("SUCCESS");
    } catch (err) {
      setError(readApiMessage(err, "Failed to reset password."));
    } finally {
      setLoading(false);
    }
  }

  const subheading = (
    <span>
      Remember your password?{" "}
      <Link to="/login" className="text-[var(--color-primary)] hover:underline font-medium">
        Back to Login
      </Link>
    </span>
  );

  if (step === "SUCCESS") {
    return (
      <AuthLayout heading="Password Reset">
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl text-white">Your password has been reset successfully.</p>
          <Button onClick={() => navigate("/login")} className="w-full">
            Go to Login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Reset Password" subheading={subheading}>
      {step === "REQUEST" && (
        <form onSubmit={handleRequest} className="space-y-6">
          <p className="text-[var(--muted)]">
            Enter your email address to receive a verification code.
          </p>
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            error={error}
          />
          <Button type="submit" className="w-full" isLoading={loading}>
            Send Verification Code
          </Button>
        </form>
      )}

      {step === "VERIFY" && (
        <form onSubmit={handleVerify} className="space-y-6">
          <p className="text-[var(--muted)]">
            We've sent a 6-digit code to <strong className="text-white">{email}</strong>.
          </p>
          <Input
            type="text"
            placeholder="6-digit code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            required
            maxLength={6}
            disabled={loading}
            error={error}
          />
          <div className="flex flex-col gap-4">
            <Button type="submit" isLoading={loading}>
              Verify Code
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep("REQUEST");
                setOtpCode("");
                setError(undefined);
              }}
              disabled={loading}
            >
              Back
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                className="text-sm font-bold tracking-normal uppercase-none"
                onClick={handleResend}
                disabled={countdown > 0}
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : "Resend Reset Code"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === "CONFIRM" && (
        <form onSubmit={handleConfirm} className="space-y-6">
          <p className="text-[var(--muted)]">
            Verification successful. Choose a new secure password.
          </p>
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            error={error}
          />
          <Button type="submit" className="w-full" isLoading={loading}>
            Reset Password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
