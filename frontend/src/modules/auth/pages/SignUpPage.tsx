import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, AtSign, Check, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { signUpResend, signUpVerify } from "@/modules/auth/api/authApi";
import { checkUsernameAvailability } from "@/features/settings/api";
import { runSignUpFlow, runSignUpFinalizeFlow } from "@/modules/auth/utils/authFlows";
import { getErrorMessage } from "@/shared/lib/errorHelper";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";
import { toast } from "@/shared/ui/Toast";

type Step = "EMAIL" | "OTP" | "DETAILS";

export function SignUpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("EMAIL");
  const [loading, setLoading] = useState(false);
  const [signupToken, setSignupToken] = useState("");
  const [resendInterval, setResendInterval] = useState(60);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const { values, getFieldProps, setErrors, setFieldTouched, setFieldValue } = useForm({
    initialValues: {
      email: "",
      otpCode: "",
      fullName: "",
      username: "",
      password: "",
      confirmPassword: "",
      agree: true
    },
    schema: {
      email: v.string().email().required("Email is required"),
      otpCode: v.string().min(6, "Must be 6 digits").required("Code is required"),
      fullName: v.string().required("Full name is required"),
      username: v.string().min(3, "Too short").max(30, "Too long").required("Username is required"),
      password: v.string().min(8, "Minimum 8 characters").required("Password is required"),
      confirmPassword: v.string().matches("password", "Passwords do not match").required("Confirmation is required")
    },
    onSubmit: () => { }
  });

  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'taken' | null>(null);

  useEffect(() => {
    if (step === "DETAILS" && values.username && values.username.length >= 3) {
      setUsernameStatus('checking');
      const timeoutId = setTimeout(async () => {
        try {
          const data = await checkUsernameAvailability(values.username);
          if (data.success && data.data) {
            setUsernameStatus(data.data.available ? 'available' : 'taken');
          } else {
            setUsernameStatus(null);
          }
        } catch {
          setUsernameStatus(null);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setUsernameStatus(null);
    }
  }, [values.username, step]);



  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    const rules = v.string().email().required("Email is required").build();
    for (const rule of rules) {
      const err = rule(values.email);
      if (err) {
        setErrors({ email: err });
        setFieldTouched("email");
        return;
      }
    }

    setLoading(true);
    try {
      const data = await runSignUpFlow({ email: values.email });
      setResendInterval(data.resend_interval);
      setCountdown(data.resend_interval);
      toast.success("Verification code sent.");
      setStep("OTP");
    } catch (err) {
      const msg = getErrorMessage(err, "Sign up failed.");
      toast.error(msg);
      setErrors({ email: msg } as any);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      await signUpResend({ email: values.email });
      setCountdown(resendInterval);
      toast.success("Code resent.");
    } catch (err) {
      toast.error("Resend failed.");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const rules = v.string().min(6).required().build();
    for (const rule of rules) {
      const err = rule(values.otpCode);
      if (err) {
        setErrors({ otpCode: err || "Invalid code" });
        setFieldTouched("otpCode");
        return;
      }
    }

    setLoading(true);
    try {
      const data = await signUpVerify({ email: values.email, otp_code: values.otpCode });
      setSignupToken(data.signup_token);
      setStep("DETAILS");
    } catch (err: any) {
      const msg = getErrorMessage(err, "Verification failed.");
      toast.error(msg);
      setErrors({ otpCode: msg } as any);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();
    if (!values.agree) {
      setErrors({ confirmPassword: "Terms agreement required." });
      return;
    }

    setLoading(true);
    try {
      const result = await runSignUpFinalizeFlow({
        signup_token: signupToken,
        full_name: values.fullName.trim(),
        username: values.username.trim(),
        password: values.password,
        confirm_password: values.confirmPassword,
      });
      navigate(result.is_restricted ? "/auth?mode=restricted" : "/settings/profile");
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to complete setup.");
      toast.error(msg);
      setErrors({ confirmPassword: msg } as any);
    } finally {
      setLoading(false);
    }
  }

  const loginFooter = (
    <p className="text-center text-xs font-bold text-slate-400">
      Already have an account? <Link to="/auth?mode=login" className="text-slate-900 hover:underline">Log in</Link>
    </p>
  );

  const getLayoutProps = () => {
    switch (step) {
      case "EMAIL":
        return {
          heading: "Join ChitChat",
          subheading: "Create your account and start chatting in seconds.",
          footer: loginFooter,
        };
      case "OTP":
        return {
          heading: "Verify email",
          subheading: `Enter the code we sent to ${values.email}`,
          footer: <p className="text-center text-xs font-bold text-slate-400">Mistyped? <button onClick={() => setStep("EMAIL")} className="text-slate-900 hover:underline">Change Email</button></p>,
        };
      case "DETAILS":
        return {
          heading: "Complete profile",
          subheading: "Set up your name and password to get started.",
        };
      default:
        return { heading: "Loading", subheading: "" };
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
          {step === "EMAIL" && (
            <form onSubmit={handleEmail} noValidate className="space-y-4">
              <Input
                type="email"
                placeholder="Email address"
                icon={<Mail size={18} />}
                {...getFieldProps("email")}
                disabled={loading}
              />
              <Button type="submit" className="w-full mt-4" isLoading={loading}>
                Get Started
              </Button>
            </form>
          )}

          {step === "OTP" && (
            <form onSubmit={handleVerify} noValidate className="space-y-6">
              <OtpInput
                value={values.otpCode}
                onChange={(val) => setFieldValue("otpCode", val)}
                isLoading={loading}
              />
              <div className="flex flex-col gap-3">
                <Button type="submit" className="w-full" isLoading={loading}>
                  Verify Code
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

          {step === "DETAILS" && (
            <form onSubmit={handleFinalize} noValidate className="space-y-4">
              <Input
                type="text"
                placeholder="Full name"
                icon={<User size={18} />}
                {...getFieldProps("fullName")}
                disabled={loading}
              />
              <div className="space-y-1">
                <Input
                  type="text"
                  placeholder="Username (e.g. john_doe)"
                  icon={<AtSign size={18} />}
                  {...getFieldProps("username")}
                  disabled={loading}
                />
                {usernameStatus === 'checking' && <p className="pl-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider animate-pulse">Checking availability...</p>}
                {usernameStatus === 'available' && <p className="pl-1 text-[10px] font-bold text-green-500 uppercase tracking-wider flex items-center gap-1"><Check size={10} /> Available</p>}
                {usernameStatus === 'taken' && <p className="pl-1 text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1"><AlertCircle size={10} /> Taken</p>}
              </div>

              <Input
                type="password"
                placeholder="Password"
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

              <div className="flex items-start gap-3 px-1 py-1">
                <input
                  id="terms"
                  type="checkbox"
                  checked={values.agree}
                  onChange={(e) => setFieldValue("agree", e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-200"
                />
                <label htmlFor="terms" className="text-[12px] font-bold text-slate-400 leading-tight">
                  Agree to <Link to="/terms" className="text-slate-900 hover:underline">Terms & Conditions</Link>
                </label>
              </div>

              <Button type="submit" className="w-full mt-2" isLoading={loading}>
                Create Account
              </Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
}
