import { InputHTMLAttributes, ButtonHTMLAttributes, forwardRef, useState, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, icon, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-2.5 animate-fade-in-up">
        {label && (
          <label className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </label>
        )}
        <div className="group relative">
          {icon && (
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-300 group-focus-within:text-sky-600">
              {icon}
            </div>
          )}
          <input
            {...props}
            ref={ref}
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "w-full rounded-2xl border border-slate-200 bg-white py-4 text-slate-950 outline-none transition-all duration-300 placeholder:text-slate-400",
              "focus:border-sky-300 focus:bg-sky-50/40 focus:shadow-[0_0_0_4px_rgba(186,230,253,0.45)]",
              icon ? "pl-14 pr-14" : "px-6 pr-14",
              error && "border-rose-300 focus:border-rose-300 focus:shadow-[0_0_0_4px_rgba(254,205,211,0.45)]",
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-all duration-300 hover:text-slate-700"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && <p className="animate-shake pl-1 text-[11px] font-medium text-rose-600">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

const variants = {
  primary:
    "border border-slate-950 bg-slate-950 text-white shadow-[0_24px_50px_-25px_rgba(15,23,42,0.7)] hover:bg-slate-800 hover:shadow-[0_28px_60px_-25px_rgba(15,23,42,0.75)]",
  outline: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  ghost: "border-none bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700",
  link: "h-auto border-none bg-transparent px-0 py-0 text-sky-700 hover:text-sky-800 hover:underline",
  social: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
    <button
      className={cn(
        "group relative flex items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-2xl px-6 py-4 text-sm font-semibold transition-all duration-300 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        isLoading && "cursor-wait",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <>
          {leftIcon && <span className="transition-transform group-hover:-translate-x-0.5">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="transition-transform group-hover:translate-x-0.5">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
