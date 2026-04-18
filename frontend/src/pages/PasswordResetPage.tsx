import { FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ShieldCheck, Lock, CheckCircle, ArrowLeft } from "lucide-react";

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

  if (step === "SUCCESS") {
    return (
      <AuthLayout heading="Password reset complete" subheading="Your account is ready for sign-in again.">
        <div className="space-y-8 py-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-6 rounded-[28px] border border-slate-200 bg-slate-50 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
              <CheckCircle className="text-sky-700" size={40} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold leading-tight text-slate-950">Password Reset Complete</p>
              <p className="text-sm text-slate-600">Your account is now secure again.</p>
            </div>
          </div>
          <Button onClick={() => navigate("/auth/login")} className="w-full py-4">
            Sign In Now
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const getHeading = () => {
    if (step === "REQUEST") return "Recover account";
    if (step === "VERIFY") return "Verify email";
    return "Set new password";
  };

  const getSubheading = () => {
    if (step === "REQUEST") return "Request a recovery code using your account email address.";
    if (step === "VERIFY") return "Confirm the code before creating a new password.";
    return "Choose a strong password and confirm it once.";
  };

  return (
    <AuthLayout heading={getHeading()} subheading={getSubheading()}>
      <div className="space-y-6">
        {step === "REQUEST" && (
          <form onSubmit={handleRequest} className="space-y-8 animate-fade-in-up">
            <Input
              type="email"
              label="Email Address"
              placeholder="name@company.com"
              icon={<Mail size={20} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              error={error}
            />
            <div className="flex flex-col gap-6">
              <Button type="submit" className="w-full py-4" isLoading={loading}>
                Send Recovery Code
              </Button>
              <button
                type="button"
                onClick={() => navigate("/auth/login")}
                className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </div>
          </form>
        )}

        {step === "VERIFY" && (
          <form onSubmit={handleVerify} className="space-y-8 animate-fade-in-up">
            <div className="flex flex-col items-center gap-1 rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sent to</span>
              <span className="font-semibold text-slate-950">{email}</span>
            </div>

            <Input
              type="text"
              label="Recovery Code"
              placeholder="6-digit code"
              icon={<ShieldCheck size={20} />}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
              maxLength={6}
              disabled={loading}
              error={error}
            />
            <div className="flex flex-col gap-5">
              <Button type="submit" className="py-4" isLoading={loading}>
                Verify Code
              </Button>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full py-4"
                  onClick={() => setStep("REQUEST")}
                  disabled={loading}
                >
                  Change Email
                </Button>
              </div>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm"
                  onClick={handleResend}
                  disabled={countdown > 0}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend Recovery Code"}
                </Button>
              </div>
            </div>
          </form>
        )}

        {step === "CONFIRM" && (
          <form onSubmit={handleConfirm} className="space-y-8 animate-fade-in-up">
            <Input
              type="password"
              label="New Password"
              placeholder="Enter new password"
              icon={<Lock size={20} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              type="password"
              label="Confirm Password"
              placeholder="Repeat your password"
              icon={<Lock size={20} />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              error={error}
            />
            <Button type="submit" className="w-full py-4" isLoading={loading}>
              Update Password
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
