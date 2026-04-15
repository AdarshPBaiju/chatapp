import { FormEvent, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

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
      <main className="container">
        <Card>
          <h1>Success!</h1>
          <p>Your password has been reset successfully.</p>
          <button onClick={() => navigate("/login")}>Go to Login</button>
        </Card>
      </main>
    );
  }

  return (
    <main className="container">
      <Card>
        <h1>Reset Password</h1>
        
        {step === "REQUEST" && (
          <form className="stack" onSubmit={handleRequest}>
            <p>Enter your email address to receive a verification code.</p>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <FormError message={error} />
            <button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Verification Code"}
            </button>
          </form>
        )}

        {step === "VERIFY" && (
          <form className="stack" onSubmit={handleVerify}>
            <p>We've sent a 6-digit code to <strong>{email}</strong>.</p>
            <input
              type="text"
              placeholder="6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
              maxLength={6}
              disabled={loading}
            />
            <FormError message={error} />
            <div className="row">
              <button type="button" className="secondary" onClick={() => setStep("REQUEST")}>
                Back
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Verifying..." : "Verify Code"}
              </button>
            </div>
            <div className="center" style={{ marginTop: "1rem" }}>
              <button 
                type="button" 
                className="link" 
                onClick={handleResend} 
                disabled={countdown > 0}
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : "Resend Reset Code"}
              </button>
            </div>
          </form>
        )}

        {step === "CONFIRM" && (
          <form className="stack" onSubmit={handleConfirm}>
            <p>Verification successful. Choose a new secure password.</p>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
            <FormError message={error} />
            <button type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <p style={{ marginTop: "1.5rem", textAlign: "center" }}>
          Remember your password? <Link to="/login">Back to Login</Link>
        </p>
      </Card>
    </main>
  );
}
