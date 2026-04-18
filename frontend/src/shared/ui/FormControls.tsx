import { ReactNode, useState, forwardRef, InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";
import { cn } from "@/shared/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, icon, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-2">
        {label && (
          <label className="pl-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
            {label}
          </label>
        )}
        <div className="group relative">
          {icon && (
            <div className={cn(
              "absolute left-5 top-1/2 -translate-y-1/2 transition-all duration-300",
              isFocused ? "text-foreground" : "text-muted-foreground"
            )}>
              {icon}
            </div>
          )}
          <input
            {...props}
            ref={ref}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "w-full rounded-2xl border bg-background px-5 py-4 text-foreground outline-none transition-all duration-300",
              "placeholder:text-muted-foreground/40 font-medium",
              isFocused 
                ? "border-primary shadow-[0_0_0_4px_var(--primary)/2%] shadow-xl" 
                : "border-border shadow-sm",
              icon ? "pl-14 pr-14" : "px-6 pr-14",
              error && "border-destructive/30 focus:border-destructive/50 focus:ring-destructive/5",
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-300 hover:text-foreground"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        <AnimatePresence mode="wait">
          {error && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pl-1 text-[11px] font-bold text-destructive uppercase tracking-wider"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
Input.displayName = "Input";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
}

export function OtpInput({ value, onChange, isLoading }: OtpInputProps) {
  const inputs = Array(6).fill(0);
  const values = value.split("").concat(Array(6 - value.length).fill(""));

  const handleChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newValues = [...values];
    newValues[index] = val.slice(-1);
    const finalValue = newValues.join("");
    onChange(finalValue);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      onChange(pastedData);
    }
  };

  return (
    <div className="flex justify-between gap-3 sm:gap-4 md:gap-5" onPaste={handlePaste}>
      {inputs.map((_, i) => (
        <motion.input
          key={i}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={values[i]}
          disabled={isLoading}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={cn(
            "h-16 w-full rounded-2xl border transition-all duration-300 text-center text-2xl font-bold",
            values[i] 
              ? "border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/10" 
              : "border-border bg-background text-foreground focus:border-primary focus:shadow-[0_0_0_4px_var(--primary)/3%] shadow-sm"
          )}
        />
      ))}
    </div>
  );
}

const variants = {
  primary: "btn-premium",
  outline: "border-2 border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground shadow-sm",
  ghost: "border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  link: "h-auto border-none bg-transparent px-0 py-0 text-muted-foreground hover:text-foreground underline-offset-4 hover:underline",
  social: "border border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted shadow-sm",
};

interface ButtonProps extends HTMLMotionProps<"button"> {
  children?: ReactNode;
  variant?: keyof typeof variants;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  children,
  className,
  variant = "primary",
  isLoading,
  leftIcon,
  rightIcon,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative flex items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-2xl px-8 py-4 text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        isLoading && "cursor-wait",
        className,
      )}
      {...props}
    >
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="h-5 w-5 animate-spin rounded-full border-2 border-current/30 border-t-current" 
          />
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            {leftIcon && <span className="transition-transform group-hover:-translate-x-1">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="transition-transform group-hover:translate-x-1">{rightIcon}</span>}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Premium shine effect on hover */}
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
    </motion.button>
  );
}
