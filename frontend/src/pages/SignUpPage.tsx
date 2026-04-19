import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User } from "lucide-react";

import { signUpResend, signUpVerify } from "@/features/auth/api";
import { runSignUpFlow, runSignUpFinalizeFlow } from "@/features/auth/flows";
import { readApiMessage } from "@/shared/lib/apiResponse";
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

  const { values, getFieldProps, setErrors, setFieldTouched, setFieldValue, errors, touched } = useForm({
    initialValues: {
      email: "",
      otpCode: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
      agree: true
    },
    schema: {
      email: v.string().email().required("Email is required"),
      otpCode: v.string().min(6, "Must be 6 digits").required("Code is required"),
      firstName: v.string().name("Invalid characters").required("First name is required"),
      lastName: v.string().name("Invalid characters").required("Last name is required"),
      password: v.string().min(8, "Minimum 8 characters").required("Password is required"),
      confirmPassword: v.string().matches("password", "Passwords do not match").required("Confirmation is required")
    },
    onSubmit: () => {} // Handled manually per step to control transitions
  });

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    
    // Manual validate step 1 using DSL build
    const rules = v.string().email().required("Email is required").build();
    for(const rule of rules) {
      const err = rule(values.email);
      if (err) {
        setErrors({ email: err });
        setFieldTouched("email");
        return;
      }
    }

    setLoading(true);
    try {
      const emailToRequest: string = values.email;
      const data = await runSignUpFlow({ email: emailToRequest });
      setResendInterval(data.resend_interval);
      toast.success("Verification code sent to your email.");
      setStep("OTP");
    } catch (err) {
      const msg = readApiMessage(err, "Sign up failed.");
      toast.error(msg);
      setErrors({ email: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      const emailToResend: string = values.email;
      await signUpResend({ email: emailToResend });
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
    
    // Manual validate step 2
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
    try {
      const emailToVerify: string = values.email;
      const data = await signUpVerify({ email: emailToVerify, otp_code: values.otpCode });
      setSignupToken(data.signup_token);
      setStep("DETAILS");
    } catch (err: any) {
      const msg = readApiMessage(err, "Verification failed.");
      toast.error(msg);
      if (err?.response?.status === 409) {
        setErrors({ otpCode: "This account already exists. Please login instead." });
        return;
      }
      setErrors({ otpCode: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();

    // Validate all details using DSL
    const detailSchema: Record<string, any> = {
      firstName: v.string().name().required(),
      lastName: v.string().name().required(),
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

    if (!values.agree) {
      setErrors({ confirmPassword: "You must agree to the Terms & Conditions." });
      return;
    }

    setLoading(true);
    try {
      const result = await runSignUpFinalizeFlow({
        signup_token: signupToken,
        full_name: `${values.firstName} ${values.lastName}`.trim(),
        password: values.password,
        confirm_password: values.confirmPassword,
      });

      navigate(result.is_restricted ? "/auth/active-sessions" : "/settings/profile");
    } catch (err) {
      const msg = readApiMessage(err, "Failed to complete setup.");
      toast.error(msg);
      setErrors({ confirmPassword: msg });
    } finally {
      setLoading(false);
    }
  }

  const loginFooter = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Already have a ChitChat account?</span>
      <Link to="/auth/login" className="font-bold text-foreground transition-colors hover:underline">
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
        <form onSubmit={handleEmail} noValidate className="space-y-8">
          <Input
            type="email"
            label="Email Address"
            placeholder="name@company.com"
            icon={<Mail size={20} />}
            {...getFieldProps("email")}
            disabled={loading}
          />

          <div className="flex flex-col gap-6">
            <Button type="submit" className="w-full py-4 text-sm font-black" isLoading={loading}>
              Create Account
            </Button>
          </div>
        </form>
      )}

      {step === "OTP" && (
        <form onSubmit={handleVerify} noValidate className="space-y-8">
          <div className="flex flex-col items-center gap-1 rounded-[24px] border border-border bg-muted/50 p-6 text-center backdrop-blur-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">Sent to</span>
            <span className="font-bold text-foreground">{values.email}</span>
          </div>

          <div className="space-y-4">
            <label className="pl-1 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
              Verification Code
            </label>
            <OtpInput
              value={values.otpCode}
              onChange={(val) => setFieldValue("otpCode", val)}
              isLoading={loading}
            />
            {touched.otpCode && errors.otpCode && (
              <p className="pl-1 text-[11px] font-bold text-destructive uppercase tracking-widest animate-shake">
                {errors.otpCode}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Button type="submit" className="py-4 text-sm font-black" isLoading={loading}>
              Verify Code
            </Button>
            <Button
              type="button"
              variant="outline"
              className="py-4 text-sm font-black"
              onClick={() => {
                setStep("EMAIL");
                setFieldValue("otpCode", "");
                setErrors({});
              }}
              disabled={loading}
            >
              Change Email
            </Button>
            <div className="text-center pt-2">
              <Button
                type="button"
                variant="link"
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                onClick={handleResend}
                disabled={countdown > 0}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === "DETAILS" && (
        <form onSubmit={handleFinalize} noValidate className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="text"
              label="First Name"
              placeholder="John"
              icon={<User size={18} />}
              {...getFieldProps("firstName")}
              disabled={loading}
            />
            <Input
              type="text"
              label="Last Name"
              placeholder="Doe"
              icon={<User size={18} />}
              {...getFieldProps("lastName")}
              disabled={loading}
            />
          </div>

          <Input
            type="password"
            label="New Password"
            icon={<Lock size={18} />}
            placeholder="Create a strong password"
            {...getFieldProps("password")}
            disabled={loading}
          />
          <Input
            type="password"
            label="Confirm Password"
            icon={<Lock size={18} />}
            placeholder="Repeat your password"
            {...getFieldProps("confirmPassword")}
            disabled={loading}
          />

          <div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/50 px-5 py-4 backdrop-blur-sm">
            <input
              id="terms"
              type="checkbox"
              checked={values.agree}
              onChange={(e) => setFieldValue("agree", e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-border bg-background text-primary focus:ring-primary/20 transition-all"
            />
            <label htmlFor="terms" className="cursor-pointer select-none text-[13px] font-medium leading-6 text-muted-foreground">
              I agree to the{" "}
              <Link to="/terms" className="font-bold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                Terms & Conditions
              </Link>
            </label>
          </div>

          <Button type="submit" className="w-full py-4 text-sm font-black" isLoading={loading}>
            Complete Setup
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
