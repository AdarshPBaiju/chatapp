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
  variant?: "primary" | "secondary" | "outline" | "link" | "danger";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className,
  variant = "primary",
  isLoading,
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-gradient-to-tr from-[#7c5dfa] to-[#9277ff] hover:shadow-[0_0_25px_rgba(124,93,250,0.5)] text-white shadow-lg border border-white/10",
    secondary: "bg-[#2a263d] hover:bg-[#342f4d] text-white border border-white/5 backdrop-blur-md shadow-xl",
    outline: "border-2 border-white/10 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 text-white transition-all duration-500",
    link: "bg-transparent text-[#7c5dfa] hover:text-[#9277ff] p-0 w-auto",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20",
  };

  return (
    <button
      className={cn(
        "relative flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-xs transition-all duration-500 hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed group whitespace-nowrap overflow-hidden",
        variants[variant],
        isLoading && "cursor-wait",
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {/* Premium Loader: Shimmer Overlay */}
      {isLoading && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
        </div>
      )}

      {/* Content wrapper with transition */}
      <div className={cn(
        "flex flex-row items-center justify-center gap-3 transition-all duration-500",
        isLoading ? "opacity-30 blur-[2px] scale-95" : "opacity-100 scale-100"
      )}>
        {leftIcon && <span className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">{leftIcon}</span>}
        <span className="block">{children}</span>
        {rightIcon && <span className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">{rightIcon}</span>}
      </div>

      {/* Loading Spinner (Subtle) */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}
    </button>
  );
}
