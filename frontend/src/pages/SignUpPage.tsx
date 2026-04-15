import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { signUpFinalize, signUpRequest, signUpResend, signUpVerify } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";

type Step = "EMAIL" | "OTP" | "DETAILS";

export function SignUpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("EMAIL");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [signupToken, setSignupToken] = useState("");
  const [resendInterval, setResendInterval] = useState(60);
  const [countdown, setCountdown] = useState(0);

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const data = await signUpRequest({ email });
      setResendInterval(data.resend_interval);
      setCountdown(data.resend_interval);
      setStep("OTP");
    } catch (err) {
      setError(readApiMessage(err, "Sign up failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError(undefined);
    try {
      await signUpResend({ email });
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
      const data = await signUpVerify({ email, otp_code: otpCode });
      setSignupToken(data.signup_token);
      setStep("DETAILS");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError("This account already exists. Please login instead.");
        return;
      }
      setError(readApiMessage(err, "Verification failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!agree) {
      setError("You must agree to the Terms & Conditions.");
      return;
    }

    setLoading(true);
    try {
      const result = await signUpFinalize({
        signup_token: signupToken,
        full_name: `${firstName} ${lastName}`.trim(),
        password,
        confirm_password: confirmPassword,
      });

      if (result.is_restricted) {
        useAuthStore.getState().setRestricted(result.access, result.refresh, result.active_sessions || [], result.user);
      } else if ('refresh' in result) {
        useAuthStore.getState().setFull({
          access: result.access,
          refresh: result.refresh,
          user: result.user
        });
      }

      navigate(result.is_restricted ? "/session-gate" : "/dashboard");
    } catch (err) {
      setError(readApiMessage(err, "Failed to complete sign up."));
    } finally {
      setLoading(false);
    }
  }

  const subheading = (
    <span>
      Already have an account?{" "}
      <Link to="/login" className="text-[var(--color-primary)] hover:underline">
        Log in
      </Link>
    </span>
  );

  return (
    <AuthLayout heading="Create an account" subheading={subheading}>
      {step === "EMAIL" && (
        <form onSubmit={handleEmail} className="space-y-6">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            error={error}
          />
          <Button type="submit" className="w-full" isLoading={loading}>
            Continue
          </Button>
        </form>
      )}

      {step === "OTP" && (
        <form onSubmit={handleVerify} className="space-y-6">
          <p className="text-[var(--muted)]">
            Verification code sent to <strong className="text-white">{email}</strong>.
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
                setStep("EMAIL");
                setOtpCode("");
                setError(undefined);
              }}
              disabled={loading}
            >
              Change Email
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                className="text-sm font-bold tracking-normal uppercase-none"
                onClick={handleResend}
                disabled={countdown > 0}
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : "Resend Verification Code"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === "DETAILS" && (
        <form onSubmit={handleFinalize} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            disabled
            className="opacity-50 cursor-not-allowed"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            error={error}
          />

          <div className="flex items-center gap-3 py-2">
            <input
              id="terms"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="w-5 h-5 rounded border-[#37334a] bg-[#1e1b29] text-[var(--color-primary)] focus:ring-[var(--color-primary)] transition-all cursor-pointer"
            />
            <label htmlFor="terms" className="text-[var(--muted)] text-sm cursor-pointer select-none">
              I agree to the{" "}
              <a href="#" className="text-white hover:underline">
                Terms & Conditions
              </a>
            </label>
          </div>

          <Button type="submit" className="w-full" isLoading={loading}>
            Create account
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
