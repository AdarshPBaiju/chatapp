import { Outlet, useLocation, Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/shared/ui/ThemeProvider";

export function AuthShell() {
  const location = useLocation();
  const { theme } = useTheme();

  // Resolve actual theme for background selection
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  const bgImage = resolvedTheme === "dark" ? "/assets/dark.png" : "/assets/light.png";

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans selection:bg-primary/20 selection:text-foreground">
      {/* Thematic Background – switches between light.png and dark.png */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 scale-105"
        style={{ 
          backgroundImage: `url('${bgImage}')`,
          filter: 'brightness(1.02) saturate(1.05)'
        }}
      />

      {/* Atmospheric Overlays */}
      <div className="absolute inset-0 z-1 bg-gradient-to-br from-white/10 via-transparent to-black/10 transition-opacity duration-700 dark:from-white/5 dark:to-black/30" />
      
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Header / Logo */}
        <header className="px-8 py-10">
          <Link to="/" className="flex items-center gap-3 w-fit group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/40 backdrop-blur-md border border-border/20 shadow-xl transition-transform group-hover:-rotate-3">
              <MessageSquare size={20} className="text-foreground dark:text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter text-foreground dark:text-white drop-shadow-sm">ChitChat</span>
          </Link>
        </header>

        {/* Main Content Area - Centered Card */}
        <main className="flex-1 flex items-center justify-center px-6 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="w-full max-w-[480px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
