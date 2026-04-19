import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Mail, Lock, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "@/modules/auth/api/authApi";
import { getErrorMessage } from "@/shared/lib/errorHelper";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";
import { toast } from "@/shared/ui/Toast";

type Step = "REQUEST" | "VERIFY" | "CONFIRM" | "SUCCESS";

export function PasswordResetPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryEmail = new URLSearchParams(location.search).get("email") || "";
  const stateEmail = location.state?.email || "";
  const initialEmail = stateEmail || queryEmail;

  const [step, setStep] = useState<Step>("REQUEST");
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resendInterval, setResendInterval] = useState(60);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const { values, getFieldProps, setErrors, setFieldValue } = useForm({
    initialValues: {
      email: initialEmail,
      otpCode: "",
      password: "",
      confirmPassword: "",
    },
    schema: {
      email: v.string().email().required("Email is required"),
      otpCode: v.string().min(6, "Must be 6 digits").required("Code is required"),
      password: v.string().min(8, "Minimum 8 characters").required("Password is required"),
      confirmPassword: v.string().matches("password", "Passwords do not match").required("Confirmation is required")
    },
    onSubmit: () => { }
  });

  useEffect(() => {
    if (initialEmail && !values.email) {
      setFieldValue("email", initialEmail);
    }
  }, [initialEmail, setFieldValue, values.email]);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    const rules = v.string().email().required().build();
    for (const rule of rules) {
      if (rule(values.email)) {
        setErrors({ email: rule(values.email) });
        return;
      }
    }

    setLoading(true);
    try {
      const data = await requestPasswordReset({ email: values.email });
      setResendInterval(data.resend_interval);
      setCountdown(data.resend_interval);
      toast.success("Recovery code sent.");
      setStep("VERIFY");
    } catch (err: any) {
      const msg = getErrorMessage(err, "Reset failed.");
      setErrors({ email: msg } as any);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      await requestPasswordReset({ email: values.email });
      setCountdown(resendInterval);
      toast.success("Code resent.");
    } catch (err) {
      toast.error("Resend failed.");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { reset_token } = await verifyPasswordResetOtp({ email: values.email, otp_code: values.otpCode });
      setResetToken(reset_token);
      setStep("CONFIRM");
    } catch (err) {
      toast.error("Invalid code.");
      setErrors({ otpCode: "Invalid code" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmPasswordReset({
        reset_token: resetToken,
        password: values.password,
        confirm_password: values.confirmPassword,
      });
      setStep("SUCCESS");
    } catch (err: any) {
      toast.error("Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "SUCCESS") {
    return (
      <AuthLayout heading="Password updated" subheading="Your ChitChat account is now secure.">
        <div className="space-y-6 pt-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-900">
              <CheckCircle size={32} />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500">You can now sign in with your new password.</p>
          <Button onClick={() => navigate("/auth?mode=login")} className="w-full mt-4">
            Sign In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const getLayoutProps = () => {
    switch (step) {
      case "REQUEST":
        return {
          heading: "Recover account",
          subheading: "Enter your email to receive a recovery code.",
          footer: <p className="text-center text-xs font-bold text-slate-400">Remembered? <Link to="/auth?mode=login" className="text-slate-900 hover:underline">Log in</Link></p>,
        };
      case "VERIFY":
        return {
          heading: "Verify code",
          subheading: `Enter the code sent to ${values.email}`,
          footer: <p className="text-center text-xs font-bold text-slate-400">Mistyped? <button onClick={() => setStep("REQUEST")} className="text-slate-900 hover:underline">Change Email</button></p>,
        };
      case "CONFIRM":
        return {
          heading: "Set new password",
          subheading: "Choose a strong password for your ChitChat account.",
        };
      default:
        return { heading: "Recovery", subheading: "" };
    }
  };

  const layoutProps = getLayoutProps();

  return (
    <AuthLayout {...layoutProps}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {step === "REQUEST" && (
            <form onSubmit={handleRequest} noValidate className="space-y-4">
              <Input
                type="email"
                placeholder="Email address"
                icon={<Mail size={18} />}
                {...getFieldProps("email")}
                disabled={loading}
              />
              <Button type="submit" className="w-full mt-4" isLoading={loading}>
                Send Code
              </Button>
            </form>
          )}

          {step === "VERIFY" && (
            <form onSubmit={handleVerify} noValidate className="space-y-6">
              <OtpInput
                value={values.otpCode}
                onChange={(val) => setFieldValue("otpCode", val)}
                isLoading={loading}
              />
              <div className="flex flex-col gap-3">
                <Button type="submit" className="w-full" isLoading={loading}>
                  Verify
                </Button>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400">
                    Didn't get it?{" "}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={countdown > 0}
                      className="text-slate-900 hover:underline disabled:opacity-50"
                    >
                      {countdown > 0 ? `Resend in ${countdown}s` : "Resend"}
                    </button>
                  </span>
                </div>
              </div>
            </form>
          )}

          {step === "CONFIRM" && (
            <form onSubmit={handleConfirm} noValidate className="space-y-4">
              <Input
                type="password"
                placeholder="New password"
                icon={<Lock size={18} />}
                {...getFieldProps("password")}
                disabled={loading}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                icon={<Lock size={18} />}
                {...getFieldProps("confirmPassword")}
                disabled={loading}
              />
              <Button type="submit" className="w-full mt-4" isLoading={loading}>
                Update Password
              </Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
}
