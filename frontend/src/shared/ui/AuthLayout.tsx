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
        className="overflow-hidden rounded-[32px] bg-card/40 backdrop-blur-2xl border border-border/40 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.1)] p-8 sm:p-10 lg:p-12 transition-all duration-300 dark:bg-card/20 dark:border-white/5 dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.4)]"
      >
        <div className="mb-10 text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tighter text-foreground">
            {heading}
          </h1>
          {subheading && (
            <div className="text-sm font-semibold text-muted-foreground/80 dark:text-white/80 max-w-[280px] mx-auto leading-relaxed">
              {subheading}
            </div>
          )}
        </div>

        <div className="animate-in fade-in duration-100">
          {children}
        </div>

        {footer && (
          <div className="mt-10 border-t border-border/50 pt-8 text-foreground/70 dark:text-white/70 text-[13px] font-medium">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
