import { useState, useRef, useCallback } from "react";
import { useIdentityMachine } from "../machine";
import { runIdentityChallenge } from "../flows";
import { Button, OtpInput } from "@/shared/ui/FormControls";
import { useJitterSubmit } from "../hooks";

interface OtpGateProps {
  method: "email_otp" | "totp";
}

export function OtpGate({ method }: OtpGateProps) {
  const { isLoading, error, setError } = useIdentityMachine();
  const [otpCode, setOtpCode] = useState("");
  const isSubmitting = useRef<boolean>(false);

  const submit = useJitterSubmit(useCallback(async () => {
    if (isLoading || isSubmitting.current) return;
    
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    isSubmitting.current = true;
    try {
      await runIdentityChallenge({
        method,
        code: otpCode
      });
    } finally {
      isSubmitting.current = false;
    }
  }, [otpCode, isLoading, method, setError]));

  const handleResend = async () => {
    setError(null);
    await runIdentityChallenge({ method: "email_otp" });
  };



  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <OtpInput
        value={otpCode}
        onChange={setOtpCode}
        isLoading={isLoading}
      />

      {error && (
        <p className="text-sm font-bold text-destructive text-center animate-shake">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <Button 
          type="button" 
          className="w-full py-4 text-sm font-black" 
          isLoading={isLoading}
          onClick={submit}
          disabled={otpCode.length !== 6}
        >
          Verify code
        </Button>
        
        {method === "email_otp" && (
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive a code?{" "}
            <button 
              type="button" 
              onClick={handleResend}
              className="font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              Resend
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
