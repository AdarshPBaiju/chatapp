import { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface AuthLayoutProps {
  children: ReactNode;
  heading: string;
  subheading?: ReactNode;
  image?: string;
  imageAlt?: string;
  isWide?: boolean;
}

export function AuthLayout({
  children,
  heading,
  subheading,
  image = "https://placehold.co/1200x1600/ffffff/7c5dfa?text=AMU+Chat\nPremium+Experience",
  imageAlt = "Authentication background",
  isWide = false,
}: AuthLayoutProps) {
  return (
    <div className="relative flex flex-col lg:flex-row min-h-screen bg-[#0f0e1a] text-[var(--foreground)] overflow-hidden">
      <div className="noise-overlay" />
      
      {/* Left Side: Branding & Image (Optimized) */}
      <div className="relative w-full lg:w-[45%] h-72 lg:h-auto overflow-hidden p-10 lg:p-14 flex flex-col justify-between m-5 rounded-[2.5rem] shadow-2xl">
        {/* Background Image Panel */}
        <div className="absolute inset-0 z-0 scale-110">
          <img
            src={image}
            alt={imageAlt}
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 auth-gradient-overlay" />
        </div>

        {/* Content Overlays */}
        <div className="relative z-10">
          <div className="text-4xl font-black tracking-tighter text-white drop-shadow-lg">
            AMU<span className="text-[var(--color-primary)]">.</span>
          </div>
        </div>

        <div className="relative z-10 mt-auto">
          <h2 className="text-4xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight drop-shadow-2xl">
            AMU Chat<br />
            <span className="text-white/60">Premium Experience</span>
          </h2>
        </div>
      </div>

      {/* Right Side: Form Area (Optimized) */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6 lg:p-12 overflow-y-auto radial-glow min-h-[600px]">
        <div className={cn(
          "w-full glass-card p-10 lg:p-20 rounded-[3rem] opacity-0 animate-fade-in-up transition-all duration-700 shadow-3xl",
          isWide ? "max-w-4xl" : "max-w-[32rem]"
        )}>
          <div className="space-y-4 mb-12">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              {heading}
            </h1>
            {subheading && (
              <div className="text-[#8b87a5] text-lg font-medium tracking-wide">
                {subheading}
              </div>
            )}
          </div>

          <div className="transition-all duration-500">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
