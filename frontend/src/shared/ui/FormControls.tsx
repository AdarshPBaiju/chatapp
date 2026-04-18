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
          <label className="pl-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 group-focus-within:text-slate-900 transition-colors">
            {label}
          </label>
        )}
        <div className="group relative">
          {icon && (
            <div className={cn(
              "absolute left-5 top-1/2 -translate-y-1/2 transition-all duration-300",
              isFocused ? "text-slate-900 scale-110" : "text-slate-400"
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
              "form-input-premium w-full",
              icon ? "pl-14 pr-14" : "px-6 pr-14",
              error && "border-rose-200 focus:border-rose-400 focus:ring-rose-500/5",
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-all duration-300 hover:text-slate-900"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
          
          {/* Animated bottom border focus effect */}
          <motion.div 
            initial={false}
            animate={{ scaleX: isFocused ? 1 : 0 }}
            className="absolute bottom-0 left-6 right-6 h-[2px] bg-slate-900 origin-center transition-transform duration-500"
          />
        </div>
        <AnimatePresence mode="wait">
          {error && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pl-1 text-[11px] font-bold text-rose-500 uppercase tracking-wider"
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

const variants = {
  primary: "btn-premium text-white",
  outline: "border-2 border-slate-100 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900 shadow-sm",
  ghost: "border-none bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900",
  link: "h-auto border-none bg-transparent px-0 py-0 text-slate-600 hover:text-slate-900 underline-offset-4 hover:underline",
  social: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm",
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
      whileHover={{ y: -2 }}
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
            className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" 
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
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
    </motion.button>
  );
}
