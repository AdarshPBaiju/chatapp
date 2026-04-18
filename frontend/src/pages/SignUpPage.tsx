import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, CheckCircle } from "lucide-react";

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
      } else if ("refresh" in result) {
        useAuthStore.getState().setFull({
          access: result.access,
          refresh: result.refresh,
          user: result.user,
        });
      }

      navigate(result.is_restricted ? "/session-gate" : "/dashboard");
    } catch (err) {
      setError(readApiMessage(err, "Failed to complete sign up."));
    } finally {
      setLoading(false);
    }
  }

  const loginFooter = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Already have a ChitChat account?</span>
      <Link to="/login" className="font-medium text-sky-700 transition-colors hover:text-sky-800">
        Log in
      </Link>
    </span>
  );

  return (
    <AuthLayout
      heading={step === "EMAIL" ? "Create account" : step === "OTP" ? "Verify email" : "Profile details"}
      subheading={
        step === "EMAIL"
          ? "Start with your email address to create a new ChitChat account."
          : step === "OTP"
            ? "Enter the verification code we sent to continue securely."
            : "Finish the last step before entering the app."
      }
      footer={step === "EMAIL" ? loginFooter : undefined}
    >
      {step === "EMAIL" && (
        <form onSubmit={handleEmail} className="space-y-8">
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
              Create Account
            </Button>

            {/* Social signup section intentionally commented out until provider auth is implemented.
            <div className="grid grid-cols-2 gap-4">
              <Button variant="social">Google</Button>
              <Button variant="social">Github</Button>
            </div>
            */}
          </div>
        </form>
      )}

      {step === "OTP" && (
        <form onSubmit={handleVerify} className="space-y-8">
          <div className="flex flex-col items-center gap-1 rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sent to</span>
            <span className="font-semibold text-slate-950">{email}</span>
          </div>

          <Input
            type="text"
            label="Verification Code"
            placeholder="6-digit code"
            icon={<CheckCircle size={20} />}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            required
            maxLength={6}
            disabled={loading}
            error={error}
          />

          <div className="flex flex-col gap-4">
            <Button type="submit" className="py-4" isLoading={loading}>
              Verify Code
            </Button>
            <Button
              type="button"
              variant="outline"
              className="py-4"
              onClick={() => {
                setStep("EMAIL");
                setOtpCode("");
                setError(undefined);
              }}
              disabled={loading}
            >
              Change Email
            </Button>
            <div className="text-center pt-2">
              <Button
                type="button"
                variant="link"
                className="text-sm"
                onClick={handleResend}
                disabled={countdown > 0}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend Verification Code"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === "DETAILS" && (
        <form onSubmit={handleFinalize} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="text"
              label="First Name"
              placeholder="John"
              icon={<User size={18} />}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              type="text"
              label="Last Name"
              placeholder="Doe"
              icon={<User size={18} />}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <Input
            type="password"
            label="New Password"
            icon={<Lock size={18} />}
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            type="password"
            label="Confirm Password"
            icon={<Lock size={18} />}
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            error={error}
          />

          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <input
              id="terms"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-slate-300 text-slate-950 focus:ring-sky-200"
            />
            <label htmlFor="terms" className="cursor-pointer select-none text-sm leading-6 text-slate-600">
              I agree to the{" "}
              <a href="#" className="font-medium text-slate-950 underline transition-colors hover:text-sky-700">
                Terms & Conditions
              </a>
            </label>
          </div>

          <Button type="submit" className="w-full py-4" isLoading={loading}>
            Complete Setup
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
