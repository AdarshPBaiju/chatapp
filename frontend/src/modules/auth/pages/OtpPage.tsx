import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { resendOtp } from "@/modules/auth/api/authApi";
import { runOtpValidationFlow } from "@/modules/auth/utils/authFlows";
import { useAuthStore } from "@/modules/auth/state/authState";
import { getErrorMessage } from "@/shared/lib/errorHelper";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, OtpInput } from "@/shared/ui/FormControls";
import { useForm } from "@/shared/hooks/useForm";
import { v } from "@/shared/lib/validation";

export function OtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const stateOtp = location.state?.otpCode || "";
  
  const pending = useAuthStore((state) => state.pendingVerification);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(pending?.resend_interval || 0);

  const { values, setFieldValue, setErrors, handleSubmit } = useForm({
    initialValues: { otpCode: stateOtp },
    schema: {
      otpCode: v.string().min(6).required()
    },
    onSubmit: async (formValues) => {
      if (!pending) return;
      setLoading(true);
      try {
        await runOtpValidationFlow(pending.user_id, formValues.otpCode);
        const status = useAuthStore.getState().status;
        if (status === "full") navigate("/app/chats");
        else if (status === "restricted") navigate("/auth?mode=restricted");
      } catch (e) {
        setErrors({ otpCode: getErrorMessage(e, "Invalid code") });
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

  if (!pending) return null;

  return (
    <AuthLayout
      heading="Verify access"
      subheading={`Enter the 6-digit code sent to ${pending.email}`}
      footer={<p className="text-center text-xs font-bold text-slate-400">Mistyped? <button onClick={() => navigate("/auth?mode=login")} className="text-slate-900 hover:underline">Change Email</button></p>}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <OtpInput
          value={values.otpCode}
          onChange={(val) => setFieldValue("otpCode", val)}
          isLoading={loading}
        />

        <div className="flex flex-col gap-3 pt-2">
          <Button type="submit" className="w-full" isLoading={loading}>
            Verify Code
          </Button>

          <div className="text-center">
            <span className="text-xs font-bold text-slate-400">
              Didn't get it?{" "}
                <button 
                  type="button" 
                  onClick={async () => {
                    await resendOtp({ user_id: pending.user_id });
                    setCountdown(60);
                  }}
                disabled={countdown > 0}
                className="text-slate-900 hover:underline disabled:opacity-50"
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend"}
              </button>
            </span>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}
