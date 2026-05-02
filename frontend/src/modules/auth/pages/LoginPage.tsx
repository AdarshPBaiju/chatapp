import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowLeft, Smartphone, KeyRound } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { runIdentityInit, runIdentityChallenge } from "@/modules/auth/utils/authFlows";
import { useAuthStore } from "@/modules/auth/state/authState";
import { useIdentityMachine } from "@/modules/auth/state/authMachine";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";
import { toast } from "@/shared/ui/Toast";

export function LoginPage() {
  const navigate = useNavigate();
  const authStatus = useAuthStore((s) => s.status);

  // Identity Machine — single source of truth for the multi-step flow
  const phase = useIdentityMachine((s) => s.phase);
  const machineEmail = useIdentityMachine((s) => s.userEmail);
  const machineError = useIdentityMachine((s) => s.error);
  const isLoading = useIdentityMachine((s) => s.isLoading);
  const allowedMethods = useIdentityMachine((s) => s.allowedMethods);
  const resetMachine = useIdentityMachine((s) => s.reset);

  // Component-level lock to prevent ANY double-firing
  const busyRef = useRef(false);

  // ─── Password step: simple state (NO useForm — eliminates onBlur ghost validation) ───
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();

  // ─── Email step: useForm is fine here (no competing buttons) ───
  const emailForm = useForm({
    initialValues: { email: "" },
    schema: { email: v.string().email().required("Email is required") },
    onSubmit: async (values) => {
      try {
        await runIdentityInit(values.email);
      } catch {
        // Error already set on machine → shown via toast
      }
    },
  });

  // ─── OTP steps: useForm for each ───
  const otpForm = useForm({
    initialValues: { code: "" },
    schema: { code: v.string().min(6, "Must be 6 digits").required("Code is required") },
    onSubmit: async (values) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await runIdentityChallenge({ method: "email_otp", code: values.code });
      } catch { /* handled by machine */ }
      finally { busyRef.current = false; }
    },
  });

  const totpForm = useForm({
    initialValues: { code: "" },
    schema: { code: v.string().min(6, "Must be 6 digits").required("Code is required") },
    onSubmit: async (values) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await runIdentityChallenge({ method: "totp", code: values.code });
      } catch { /* handled by machine */ }
      finally { busyRef.current = false; }
    },
  });

  const backupForm = useForm({
    initialValues: { code: "" },
    schema: { code: v.string().required("Backup code is required") },
    onSubmit: async (values) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await runIdentityChallenge({ method: "backup_code", code: values.code });
      } catch { /* handled by machine */ }
      finally { busyRef.current = false; }
    },
  });

  // ─── Navigation on auth state change ───
  useEffect(() => {
    if (authStatus === "full") navigate("/chats");
    else if (authStatus === "restricted") navigate("/auth?mode=restricted");
    else if (authStatus === "pending_verification") navigate("/auth?mode=verify");
  }, [authStatus, navigate]);

  // ─── Show machine errors as toasts (deduplicated) ───
  const shownErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (machineError && machineError !== shownErrorRef.current) {
      shownErrorRef.current = machineError;
      toast.error(machineError);
    }
    if (!machineError) shownErrorRef.current = null;
  }, [machineError]);

  // ─── Reset password state when phase changes ───
  useEffect(() => {
    setPassword("");
    setPasswordError(undefined);
  }, [phase]);

  // ─── Handlers ───

  const handleBack = useCallback(() => {
    shownErrorRef.current = null;
    busyRef.current = false;
    resetMachine();
  }, [resetMachine]);

  /** Submit password — completely manual, no <form> involved */
  const handlePasswordSubmit = useCallback(async () => {
    if (busyRef.current || isLoading) return;

    // Client-side validation
    if (!password.trim()) {
      setPasswordError("Password is required");
      return;
    }
    setPasswordError(undefined);

    busyRef.current = true;
    try {
      await runIdentityChallenge({ method: "password", password });
    } catch {
      // Error already set on machine → shown via toast
    } finally {
      busyRef.current = false;
    }
  }, [password, isLoading]);

  /** Request email OTP — sends the code (no verification) */
  const handleRequestEmailOtp = useCallback(async () => {
    if (busyRef.current || isLoading) return;

    // Clear stale state
    useIdentityMachine.getState().setError(null);
    shownErrorRef.current = null;

    busyRef.current = true;
    try {
      await runIdentityChallenge({ method: "email_otp" });
      toast.success("Verification code sent to your email.");
    } catch {
      // Error set on machine → shown via toast. NO false success.
    } finally {
      busyRef.current = false;
    }
  }, [isLoading]);

  // ─── Layout props per phase ───
  function getLayoutProps() {
    switch (phase) {
      case "IDENTIFY":
        return {
          heading: "Sign in to ChitChat",
          subheading: "Join the conversation that never sleeps. Real-time, secure, and snappy.",
          footer: (
            <p className="text-center text-xs font-bold text-slate-400">
              New here?{" "}
              <Link to="/auth?mode=signup" className="text-slate-900 hover:underline">
                Get Started
              </Link>
            </p>
          ),
        };
      case "METHOD_SELECT":
        return {
          heading: "Choose sign-in method",
          subheading: `Signing in as ${machineEmail}`,
          footer: <BackButton onClick={handleBack} />,
        };
      case "PASSWORD_CHECK":
        return {
          heading: "Enter password",
          subheading: `Signing in as ${machineEmail}`,
          footer: (
            <div className="space-y-3">
              {allowedMethods.includes("email_otp") && (
                <button
                  type="button"
                  onClick={handleRequestEmailOtp}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-all disabled:opacity-50"
                >
                  <Mail size={14} /> Use email code instead
                </button>
              )}
              <BackButton onClick={handleBack} />
            </div>
          ),
        };
      case "MFA_EMAIL_OTP":
        return {
          heading: "Verify email code",
          subheading: `Enter the 6-digit code sent to ${machineEmail}`,
          footer: <BackButton onClick={handleBack} />,
        };
      case "MFA_TOTP":
        return {
          heading: "Authenticator code",
          subheading: "Enter the 6-digit code from your authenticator app.",
          footer: (
            <div className="space-y-3">
              {allowedMethods.includes("backup_code") && (
                <button
                  type="button"
                  onClick={() => useIdentityMachine.getState().setPhase("MFA_BACKUP")}
                  className="flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-all"
                >
                  <KeyRound size={14} /> Use a backup code instead
                </button>
              )}
              <BackButton onClick={handleBack} />
            </div>
          ),
        };
      case "MFA_BACKUP":
        return {
          heading: "Backup code",
          subheading: "Enter one of your single-use backup codes.",
          footer: (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => useIdentityMachine.getState().setPhase("MFA_TOTP")}
                className="flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-all"
              >
                <Smartphone size={14} /> Use authenticator app instead
              </button>
              <BackButton onClick={handleBack} />
            </div>
          ),
        };
      default:
        return { heading: "Sign In", subheading: "" };
    }
  }

  return (
    <AuthLayout {...getLayoutProps()}>
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {/* ── Step 1: Email ─────────────────────── */}
          {phase === "IDENTIFY" && (
            <form onSubmit={emailForm.handleSubmit} noValidate className="space-y-4">
              <Input
                type="email"
                placeholder="Email address"
                icon={<Mail size={18} />}
                {...emailForm.getFieldProps("email")}
                disabled={isLoading}
              />
              <Button type="submit" className="w-full mt-4" isLoading={isLoading}>
                Continue
              </Button>
            </form>
          )}

          {/* ── Step 2a: Method Selection ─────────── */}
          {phase === "METHOD_SELECT" && (
            <div className="space-y-3">
              {allowedMethods.includes("password") && (
                <Button
                  variant="outline"
                  className="w-full py-4 justify-start gap-3 text-left"
                  onClick={() => useIdentityMachine.getState().setPhase("PASSWORD_CHECK")}
                >
                  <Lock size={18} />
                  <span>Sign in with password</span>
                </Button>
              )}
              {allowedMethods.includes("email_otp") && (
                <Button
                  variant="outline"
                  className="w-full py-4 justify-start gap-3 text-left"
                  onClick={handleRequestEmailOtp}
                  isLoading={isLoading}
                >
                  <Mail size={18} />
                  <span>Sign in with email code</span>
                </Button>
              )}
            </div>
          )}

          {/* ── Step 2b: Password (NO <form>, NO useForm) ── */}
          {phase === "PASSWORD_CHECK" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Password"
                  icon={<Lock size={18} />}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(undefined);
                  }}
                  error={passwordError}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlePasswordSubmit();
                    }
                  }}
                />
                <div className="flex justify-end pr-1">
                  <Link
                    to="/auth?mode=recovery"
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-all"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
              <Button
                type="button"
                className="w-full"
                isLoading={isLoading}
                onClick={handlePasswordSubmit}
              >
                Sign In
              </Button>
            </div>
          )}

          {/* ── Step 2c: Email OTP (verify code) ──── */}
          {phase === "MFA_EMAIL_OTP" && (
            <form onSubmit={otpForm.handleSubmit} noValidate className="space-y-6">
              <OtpInput
                value={otpForm.values.code}
                onChange={(val) => otpForm.setFieldValue("code", val)}
                isLoading={isLoading}
              />
              <div className="flex flex-col gap-3">
                <Button type="submit" className="w-full" isLoading={isLoading}>
                  Verify Code
                </Button>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400">
                    Didn't get it?{" "}
                    <button
                      type="button"
                      onClick={handleRequestEmailOtp}
                      disabled={isLoading}
                      className="text-slate-900 hover:underline disabled:opacity-50"
                    >
                      Resend
                    </button>
                  </span>
                </div>
              </div>
            </form>
          )}

          {/* ── Step 3a: TOTP (Authenticator App) ── */}
          {phase === "MFA_TOTP" && (
            <form onSubmit={totpForm.handleSubmit} noValidate className="space-y-6">
              <OtpInput
                value={totpForm.values.code}
                onChange={(val) => totpForm.setFieldValue("code", val)}
                isLoading={isLoading}
              />
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Verify
              </Button>
            </form>
          )}

          {/* ── Step 3b: Backup Code ─────────────── */}
          {phase === "MFA_BACKUP" && (
            <form onSubmit={backupForm.handleSubmit} noValidate className="space-y-4">
              <Input
                type="text"
                placeholder="Backup code"
                icon={<KeyRound size={18} />}
                {...backupForm.getFieldProps("code")}
                disabled={isLoading}
              />
              <Button type="submit" className="w-full mt-4" isLoading={isLoading}>
                Verify
              </Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
}

/** Shared "back to email" navigation button */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-all"
    >
      <ArrowLeft size={14} /> Use a different email
    </button>
  );
}
