import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { resendOtp } from "@/features/auth/api";
import { runOtpValidationFlow } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

export function OtpPage() {
  const navigate = useNavigate();
  const pending = useAuthStore((state) => state.pendingVerification);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(pending?.resend_interval || 0);

  const { values, setFieldValue, setErrors, errors, touched, handleSubmit } = useForm({
    initialValues: { otpCode: "" },
    schema: {
      otpCode: v.string().min(6, "Code must be 6 digits").required("Verification code is required")
    },
    onSubmit: async (formValues) => {
      if (!pending) return;
      setLoading(true);
      try {
        await runOtpValidationFlow(pending.user_id, formValues.otpCode);
        const status = useAuthStore.getState().status;
        if (status === "full") navigate("/settings/profile");
        else if (status === "restricted") navigate("/auth/active-sessions");
      } catch (e) {
        setErrors({ otpCode: readApiMessage(e, "OTP validation failed.") });
      } finally {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function onResend() {
    if (!pending || countdown > 0) return;
    setResendLoading(true);
    try {
      await resendOtp({ user_id: pending.user_id });
      setCountdown(pending.resend_interval || 60);
    } catch (e) {
      setErrors({ otpCode: readApiMessage(e, "Failed to resend OTP.") });
    } finally {
      setResendLoading(false);
    }
  }

  if (!pending) {
    return null;
  }

  return (
    <AuthLayout
      heading="Verify access"
      subheading="Enter the 6-digit code sent to your email to continue."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <div className="flex flex-col items-center gap-1 rounded-[24px] border border-slate-200 bg-white/50 p-6 text-center backdrop-blur-sm">
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Sent to</span>
          <span className="font-bold text-slate-950">{pending.email}</span>
        </div>

        <div className="space-y-4">
          <label className="pl-1 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400" htmlFor="otp-field">
            Verification Code
          </label>
          <OtpInput
            value={values.otpCode}
            onChange={(val) => setFieldValue("otpCode", val)}
            isLoading={loading}
          />
          {touched.otpCode && errors.otpCode && (
            <p className="pl-1 text-[11px] font-bold text-rose-500 uppercase tracking-widest animate-shake">
              {errors.otpCode}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 pt-2">
          <Button
            type="submit"
            className="w-full py-4 text-sm font-black"
            isLoading={loading}
          >
            Verify Code
          </Button>

          <div className="text-center pt-1">
            <Button
              type="button"
              variant="link"
              className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-950"
              onClick={onResend}
              disabled={countdown > 0}
              isLoading={resendLoading}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-950"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
