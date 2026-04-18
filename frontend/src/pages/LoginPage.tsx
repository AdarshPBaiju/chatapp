import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowLeft, KeyRound } from "lucide-react";

import { runIdentityInit, runIdentityChallenge } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { useIdentityMachine } from "@/features/auth/machine";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";
import { OtpGate } from "@/features/auth/ui/OtpGate";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

export function LoginPage() {
  const navigate = useNavigate();
  const authStatus = useAuthStore((s) => s.status);
  const { 
    phase, 
    userEmail, 
    isLoading, 
    error, 
    reset,
    setPhase 
  } = useIdentityMachine();

  // Unified Form Hook
  const { getFieldProps, handleSubmit, setErrors } = useForm({
    initialValues: { email: "", password: "" },
    schema: {
      email: v.string().email().required("Email is required"),
      password: v.string().required("Password is required")
    },
    onSubmit: async (formValues) => {
      if (phase === "IDENTIFY") {
        await runIdentityInit(formValues.email);
      } else if (phase === "PASSWORD_CHECK") {
        await runIdentityChallenge({
          method: "password",
          password: formValues.password
        });
      }
    }
  });

  // Sync machine errors to form errors
  useEffect(() => {
    if (error) {
      if (phase === "IDENTIFY") setErrors({ email: error });
      else if (phase === "PASSWORD_CHECK") setErrors({ password: error });
    }
  }, [error, phase, setErrors]);

  // Clean up machine on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Handle successful login resolution
  useEffect(() => {
    if (authStatus === "full") navigate("/settings/profile");
    else if (authStatus === "restricted") navigate("/auth/active-sessions");
    else if (authStatus === "pending_verification") navigate("/auth/verify");
  }, [authStatus, navigate]);

  const handleBack = () => {
    if (phase === "METHOD_SELECT") reset();
    else if (phase === "PASSWORD_CHECK" || phase === "MFA_EMAIL_OTP" || phase === "MFA_TOTP") setPhase("METHOD_SELECT");
  };

  const footer = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">New to ChitChat?</span>
      <Link to="/auth/join" className="font-bold text-slate-900 transition-colors hover:text-slate-800">
        Create an account
      </Link>
    </span>
  );

  // Phase: IDENTIFY (Email Discovery)
  if (phase === "IDENTIFY") {
    return (
      <AuthLayout
        heading="Sign in"
        subheading="Enter your email to access your workspace."
        footer={footer}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Input
            type="email"
            label="Email Address"
            placeholder="name@company.com"
            icon={<Mail size={20} />}
            {...getFieldProps("email")}
            disabled={isLoading}
          />
          <Button type="submit" className="w-full py-4" isLoading={isLoading}>
            Continue
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // Phase: METHOD_SELECT (Choosing how to log in)
  if (phase === "METHOD_SELECT") {
    return (
      <AuthLayout
        heading="Security Check"
        subheading={`Continue as ${userEmail}`}
        footer={<button onClick={handleBack} className="text-sm font-medium text-slate-950 font-bold hover:underline transition-all"><ArrowLeft size={16} className="inline mr-1"/> Use a different email</button>}
      >
        <div className="space-y-4">
          <button
            onClick={() => setPhase("PASSWORD_CHECK")}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-900 hover:shadow-xl hover:shadow-slate-900/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <KeyRound size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900">Sign in with password</p>
                <p className="text-sm text-slate-500">Secure traditional login</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setPhase("MFA_EMAIL_OTP");
              runIdentityChallenge({ method: "email_otp" }); // Trigger send
            }}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-900 hover:shadow-xl hover:shadow-slate-900/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <Mail size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900">Email a login code</p>
                <p className="text-sm text-slate-500">Fast, passwordless access</p>
              </div>
            </div>
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Phase: PASSWORD_CHECK
  if (phase === "PASSWORD_CHECK") {
    return (
      <AuthLayout
        heading="Welcome back"
        subheading="Please enter your account password."
        footer={<button onClick={handleBack} className="text-sm font-medium text-slate-950 font-bold hover:underline transition-all"><ArrowLeft size={16} className="inline mr-1"/> Other login methods</button>}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Input
            type="password"
            label="Password"
            placeholder="Enter your password"
            icon={<Lock size={20} />}
            {...getFieldProps("password")}
            disabled={isLoading}
          />
          <Button type="submit" className="w-full py-4" isLoading={isLoading}>
            Sign in
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // Phase: MFA_EMAIL_OTP & MFA_TOTP (Handled by same Gate but different method)
  if (phase === "MFA_EMAIL_OTP" || phase === "MFA_TOTP") {
    return (
      <AuthLayout
        heading="Verification"
        subheading={phase === "MFA_EMAIL_OTP" ? `Enter the 6-digit code sent to ${userEmail}` : "Enter the code from your authenticator app."}
        footer={<button onClick={handleBack} className="text-sm font-medium text-sky-700"><ArrowLeft size={16} className="inline mr-1"/> Choose another method</button>}
      >
        <OtpGate 
          method={phase === "MFA_EMAIL_OTP" ? "email_otp" : "totp"} 
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Signing you in..." subheading="Evaluating identity security protocols.">
      <div className="flex justify-center py-10">
         <div className="h-12 w-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
      </div>
    </AuthLayout>
  );
}
