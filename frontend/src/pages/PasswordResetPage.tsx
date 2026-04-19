import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, CheckCircle, ArrowLeft } from "lucide-react";

import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

type Step = "REQUEST" | "VERIFY" | "CONFIRM" | "SUCCESS";

export function PasswordResetPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("REQUEST");
  const [loading, setLoading] = useState(false);
  const [signupToken, setSignupToken] = useState("");
  const [resendInterval, setResendInterval] = useState(60);
  const [countdown, setCountdown] = useState(0);

  const { values, getFieldProps, setErrors, setFieldTouched, setFieldValue } = useForm({
    initialValues: {
      email: "",
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
    onSubmit: () => {} // Handled manually per step for flow control
  });

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    
    const rules = v.string().email().required().build();
    for(const rule of rules) {
      const err = rule(values.email);
      if (err) {
        setErrors({ email: err });
        setFieldTouched("email");
        return;
      }
    }

    setLoading(true);
    setErrors({});
    try {
      const data = await requestPasswordReset({ email: values.email });
      setResendInterval(data.resend_interval);
      setCountdown(data.resend_interval);
      setStep("VERIFY");
    } catch (err) {
      setErrors({ email: readApiMessage(err, "Failed to send reset code.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      await requestPasswordReset({ email: values.email });
      setCountdown(resendInterval);
    } catch (err) {
      setErrors({ otpCode: readApiMessage(err, "Resend failed.") });
    }
  }

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    
    const rules = v.string().min(6).required().build();
    for(const rule of rules) {
      const err = rule(values.otpCode);
      if (err) {
        setErrors({ otpCode: err || "Invalid code" });
        setFieldTouched("otpCode");
        return;
      }
    }

    setLoading(true);
    setErrors({});
    try {
      const { reset_token } = await verifyPasswordResetOtp({ email: values.email, otp_code: values.otpCode });
      setSignupToken(reset_token);
      setStep("CONFIRM");
    } catch (err) {
      setErrors({ otpCode: readApiMessage(err, "Invalid verification code.") });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();

    const detailSchema: Record<string, any> = {
      password: v.string().min(8).required(),
      confirmPassword: v.string().matches("password").required()
    };

    const detailErrors: any = {};
    Object.keys(detailSchema).forEach(key => {
      const rules = detailSchema[key].build();
      for(const rule of rules) {
        const err = rule((values as any)[key], values);
        if (err) {
          detailErrors[key] = err;
          setFieldTouched(key as any);
          break;
        }
      }
    });

    if (Object.keys(detailErrors).length > 0) {
      setErrors(detailErrors);
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset({
        reset_token: signupToken,
        password: values.password,
        confirm_password: values.confirmPassword,
      });
      setStep("SUCCESS");
    } catch (err) {
      setErrors({ confirmPassword: readApiMessage(err, "Failed to reset password.") });
    } finally {
      setLoading(false);
    }
  }

  if (step === "SUCCESS") {
    return (
      <AuthLayout heading="Password reset complete" subheading="Your account is ready for sign-in again.">
        <div className="space-y-8 py-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-6 rounded-[28px] border border-border bg-muted p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="text-success" size={40} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold leading-tight text-foreground">Password Reset Complete</p>
              <p className="text-sm text-muted-foreground">Your account is now secure again.</p>
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
          <form onSubmit={handleRequest} noValidate className="space-y-8 animate-fade-in-up">
            <Input
              type="email"
              label="Email Address"
              placeholder="name@company.com"
              icon={<Mail size={20} />}
              {...getFieldProps("email")}
              disabled={loading}
            />
            <div className="flex flex-col gap-6">
              <Button type="submit" className="w-full py-4" isLoading={loading}>
                Send Recovery Code
              </Button>
              <button
                type="button"
                onClick={() => navigate("/auth/login")}
                className="flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </div>
          </form>
        )}

        {step === "VERIFY" && (
          <form onSubmit={handleVerify} noValidate className="space-y-8 animate-fade-in-up">
            <div className="flex flex-col items-center gap-1 rounded-[24px] border border-border bg-muted p-6 text-center">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Sent to</span>
              <span className="font-bold text-foreground">{values.email}</span>
            </div>

            <div className="space-y-4">
              <label className="pl-1 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                Recovery Code
              </label>
              <OtpInput
                value={values.otpCode}
                onChange={(val) => setFieldValue("otpCode", val)}
                isLoading={loading}
              />
            </div>
            <div className="flex flex-col gap-5">
              <Button type="submit" className="py-4" isLoading={loading}>
                Verify Code
              </Button>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full py-4"
                  onClick={() => {
                    setStep("REQUEST");
                    setFieldValue("otpCode", "");
                    setErrors({});
                  }}
                  disabled={loading}
                >
                  Change Email
                </Button>
              </div>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
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
          <form onSubmit={handleConfirm} noValidate className="space-y-8 animate-fade-in-up">
            <Input
              type="password"
              label="New Password"
              placeholder="Minimum 8 characters"
              icon={<Lock size={20} />}
              {...getFieldProps("password")}
              disabled={loading}
            />
            <Input
              type="password"
              label="Confirm Password"
              placeholder="Repeat your password"
              icon={<Lock size={20} />}
              {...getFieldProps("confirmPassword")}
              disabled={loading}
            />
            <Button type="submit" className="w-full py-4 shadow-xl shadow-primary/10" isLoading={loading}>
              Update Password
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
