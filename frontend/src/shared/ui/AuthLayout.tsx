import { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface AuthLayoutProps {
  children: ReactNode;
  heading: string;
  subheading?: ReactNode;
  isWide?: boolean;
  footer?: ReactNode;
}

export function AuthLayout({
  children,
  heading,
  subheading,
  isWide = false,
  footer,
}: AuthLayoutProps) {
  return (
    <div className={cn("mx-auto w-full", isWide ? "max-w-4xl" : "max-w-xl")}>
      <div 
        className="overflow-hidden rounded-[32px] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] p-8 sm:p-10 lg:p-12 transition-all duration-300"
      >
        <div className="mb-10 text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tighter text-slate-800">
            {heading}
          </h1>
          {subheading && (
            <div className="text-sm font-bold text-slate-500/80 max-w-[280px] mx-auto leading-relaxed">
              {subheading}
            </div>
          )}
        </div>

        <div className="animate-in fade-in duration-100">
          {children}
        </div>

        {footer && (
          <div className="mt-10 border-t border-slate-200/50 pt-8">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
