import { ReactNode, useState, forwardRef, useRef, InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";
import { cn } from "@/shared/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  compact?: boolean;
  onActionClick?: () => void;
  showActionIcon?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, label, error, icon, compact, onActionClick, showActionIcon, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const isPassword = type === "password";

    const handleActionClick = () => {
      if (onActionClick) {
        onActionClick();
      } else {
        setShowPassword(!showPassword);
      }
    };

    const isVisible = onActionClick ? showActionIcon : showPassword;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className={cn(
            "pl-1 font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors",
            compact ? "text-[8px]" : "text-[10px]"
          )}>
            {label}
          </label>
        )}
        <div className="group relative">
          {icon && (
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 transition-all duration-300 pointer-events-none z-10",
              compact ? "left-4" : "left-5",
              isFocused ? "text-foreground" : "text-muted-foreground/60"
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
            type={isPassword ? (isVisible ? "text" : "password") : type}
            className={cn(
              "w-full outline-none transition-all duration-300",
              "placeholder:text-muted-foreground/40 dark:placeholder:text-white/30 font-medium text-foreground",
              "bg-muted/40 border border-border focus:bg-background focus:border-accent focus:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] focus:ring-4 focus:ring-accent/5 backdrop-blur-[2px]",
              compact 
                ? "rounded-xl px-4 py-2.5 text-sm" 
                : "rounded-2xl px-5 py-3.5 text-sm",
              icon ? (compact ? "pl-11 pr-11" : "pl-13 pr-13") : (compact ? "px-4 pr-11" : "px-6 pr-13"),
              error && "border-destructive/40 bg-destructive/5 focus:border-destructive/60",
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              onClick={handleActionClick}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-all duration-300 hover:text-foreground",
                compact ? "right-4" : "right-5"
              )}
            >
              {isVisible ? <EyeOff size={compact ? 16 : 18} /> : <Eye size={compact ? 16 : 18} />}
            </button>
          )}
        </div>
        <AnimatePresence mode="wait">
          {error && (
            <motion.p 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="pl-1 text-[10px] font-bold text-red-500 uppercase tracking-wider"
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
      const focusIndex = Math.min(pastedData.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-2 sm:gap-3" onPaste={handlePaste}>
      {inputs.map((_, i) => (
        <input
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
            "rounded-2xl border transition-all duration-300 text-center font-black outline-none w-full",
            compact ? "h-12 text-lg" : "h-14 text-xl",
            values[i] 
              ? "border-primary bg-primary text-primary-foreground shadow-lg" 
              : "border-border bg-muted/40 text-foreground focus:border-accent focus:bg-background focus:ring-4 focus:ring-accent/5"
          )}
        />
      ))}
    </div>
  );
}

const variants = {
  primary: "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_8px_30px_rgba(var(--primary),0.2)] active:scale-[0.98]",
  outline: "border-2 border-border bg-transparent text-muted-foreground hover:border-accent hover:text-foreground",
  ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  link: "h-auto border-none bg-transparent px-0 py-0 text-muted-foreground hover:text-foreground hover:underline",
  social: "border border-border bg-muted/20 text-muted-foreground hover:border-accent/40 hover:bg-muted/40 hover:text-foreground shadow-sm px-4",
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
        "group relative flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-bold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
        compact 
          ? "rounded-xl px-4 py-2 text-[11px]" 
          : "rounded-2xl px-8 py-3.5 text-sm",
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
            className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" 
          />
        ) : (
          <div className="flex items-center gap-2">
            {leftIcon && <span className="transition-transform group-hover:-translate-x-0.5">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="transition-transform group-hover:translate-x-0.5">{rightIcon}</span>}
          </div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
