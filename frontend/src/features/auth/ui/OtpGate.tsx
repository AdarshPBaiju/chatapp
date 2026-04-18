import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, useCallback } from "react";
import { useIdentityMachine } from "../machine";
import { runIdentityChallenge } from "../flows";
import { Button } from "@/shared/ui/FormControls";
import { useJitterSubmit } from "../hooks";

interface OtpGateProps {
  method: "email_otp" | "totp";
}

export function OtpGate({ method }: OtpGateProps) {
  const { isLoading, error, setError } = useIdentityMachine();
  const [digits, setDigits] = useState<string[]>(new Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isSubmitting = useRef<boolean>(false);

  // Focus the first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return; // Only numbers allowed

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6).split("");
    if (pastedData.every(d => /^\d$/.test(d))) {
      const newDigits = [...digits];
      pastedData.forEach((d, i) => { if (i < 6) newDigits[i] = d; });
      setDigits(newDigits);
      inputRefs.current[Math.min(pastedData.length, 5)]?.focus();
    }
  };

  const submit = useJitterSubmit(useCallback(async () => {
    if (isLoading || isSubmitting.current) return;
    
    const fullCode = digits.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    isSubmitting.current = true;
    try {
      await runIdentityChallenge({
        method,
        code: fullCode
      });
    } finally {
      isSubmitting.current = false;
    }
  }, [digits, isLoading, method, setError]));

  const handleResend = async () => {
    setError(null);
    await runIdentityChallenge({ method: "email_otp" });
  };



  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between gap-2 sm:gap-4">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={el => (inputRefs.current[idx] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            disabled={isLoading}
            className="w-full h-14 sm:h-16 text-center text-2xl font-bold bg-background border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none disabled:opacity-50"
          />
        ))}
      </div>

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
          disabled={digits.some(d => d === "")}
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
