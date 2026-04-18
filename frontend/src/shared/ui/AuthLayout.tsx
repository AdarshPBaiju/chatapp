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
    <section className="animate-fade-in-up rounded-[32px] border border-white/70 bg-white/88 p-5 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur sm:p-7 lg:p-9">
      <div className={cn("mx-auto w-full", isWide ? "max-w-4xl" : "max-w-xl")}>
        <div className="mb-8 space-y-3 sm:mb-10">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            ChitChat
          </span>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
            {heading}
          </h1>
          {subheading && <div className="text-sm leading-7 text-slate-600 sm:text-base">{subheading}</div>}
        </div>

        <div>{children}</div>

        {footer && <div className="mt-8 border-t border-slate-200 pt-6">{footer}</div>}
      </div>
    </section>
  );
}
