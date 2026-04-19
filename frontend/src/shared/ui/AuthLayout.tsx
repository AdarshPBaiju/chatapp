import { ReactNode } from "react";
import { motion } from "framer-motion";
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
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden rounded-[32px] p-6 sm:p-8 lg:p-10"
      >
        <div className="mb-10 space-y-3">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            {heading}
          </motion.h1>
          {subheading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-sm font-bold leading-relaxed text-muted-foreground sm:text-base"
            >
              {subheading}
            </motion.div>
          )}
        </div>

        <motion.div
           initial={{ opacity: 0, y: 15 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
        >
          {children}
        </motion.div>

        {footer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-10 border-t border-border pt-8"
          >
            {footer}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
