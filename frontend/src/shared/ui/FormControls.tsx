import { ReactNode, useState, forwardRef, useRef, InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";
import { cn } from "@/shared/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  compact?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, icon, compact, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className={cn(
            "pl-1 font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors",
            compact ? "text-[9px]" : "text-[11px]"
          )}>
            {label}
          </label>
        )}
        <div className="group relative">
          {icon && (
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 transition-all duration-300",
              compact ? "left-4" : "left-5",
              isFocused ? "text-foreground" : "text-muted-foreground"
            )}>
              {icon && (typeof icon === 'object' && 'props' in icon ? (icon as any).type === 'svg' || (icon as any).props?.size ? icon : <div className={cn(compact ? "scale-75" : "")}>{icon}</div> : icon)}
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
              "w-full border bg-background text-foreground outline-none transition-all duration-300",
              "placeholder:text-muted-foreground/40 font-medium",
              compact 
                ? "rounded-xl px-4 py-2.5 text-sm" 
                : "rounded-2xl px-5 py-4 text-base",
              isFocused 
                ? "border-primary shadow-[0_0_0_4px_var(--primary)/2%] shadow-xl" 
                : "border-border shadow-sm",
              icon ? (compact ? "pl-11 pr-11" : "pl-14 pr-14") : (compact ? "px-4 pr-11" : "px-6 pr-14"),
              error && "border-destructive/30 focus:border-destructive/50 focus:ring-destructive/5",
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-300 hover:text-foreground",
                compact ? "right-4" : "right-5"
              )}
            >
              {showPassword ? <EyeOff size={compact ? 16 : 18} /> : <Eye size={compact ? 16 : 18} />}
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
  onChange: (val: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export function OtpInput({ value, onChange, isLoading, compact }: OtpInputProps) {
  const inputs = Array(6).fill(0);
  const values = value.split("").concat(Array(6 - value.length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newValues = [...values];
    newValues[index] = val.slice(-1);
    const finalValue = newValues.join("");
    onChange(finalValue);

    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      onChange(pastedData);
      // Focus the last filled input or the 6th one
      const focusIndex = Math.min(pastedData.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-3 sm:gap-4 md:gap-5" onPaste={handlePaste}>
      {inputs.map((_, i) => (
        <motion.input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={values[i]}
          disabled={isLoading}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={cn(
            "rounded-2xl border transition-all duration-300 text-center font-bold outline-none",
            compact 
              ? "h-14 w-full text-xl" 
              : "h-16 w-full text-2xl",
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
  compact?: boolean;
}

export function Button({
  children,
  className,
  variant = "primary",
  isLoading,
  leftIcon,
  rightIcon,
  compact,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative flex items-center justify-center gap-3 overflow-hidden whitespace-nowrap font-bold uppercase tracking-wider transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
        compact 
          ? "rounded-xl px-4 py-2 text-[10px]" 
          : "rounded-2xl px-8 py-4 text-sm",
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
