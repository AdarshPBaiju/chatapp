import { InputHTMLAttributes, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/shared/lib/utils";


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-[var(--muted)]">
            {label}
          </label>
        )}
        <div className="relative group">
          <input
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "w-full bg-[#2a263d] border border-white/5 rounded-2xl px-5 py-5 text-white placeholder:text-[#5e5a75] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)]/50 transition-all duration-300",
              error && "border-red-500/50 focus:ring-red-500/50",
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[#5e5a75] hover:text-white transition-all duration-300 hover:scale-110 active:scale-90"
            >
              {showPassword ? <EyeOff size={20} className="animate-in fade-in zoom-in duration-300" /> : <Eye size={20} className="animate-in fade-in zoom-in duration-300" />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500 font-medium pl-2">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";


interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "link";
  isLoading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  isLoading,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-gradient-to-tr from-[#7c5dfa] to-[#9277ff] hover:shadow-[0_0_20px_rgba(124,93,250,0.4)] text-white shadow-lg",
    secondary: "bg-white/5 hover:bg-white/10 text-white backdrop-blur-sm",
    outline: "border border-white/10 hover:border-white/30 text-white hover:bg-white/5",
    link: "bg-transparent text-[#7c5dfa] hover:text-[#9277ff] hover:underline p-0 w-auto",
  };

  return (
    <button
      className={cn(
        "relative flex items-center justify-center gap-2 px-8 py-5 rounded-2xl font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0",
        variants[variant],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 text-current" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}
      <span className={cn(
        "flex items-center justify-center gap-2 whitespace-nowrap transition-opacity duration-300",
        isLoading ? "opacity-0" : "opacity-100"
      )}>
        {children}
      </span>
    </button>
  );
}
