import { Outlet, useLocation, Link } from "react-router-dom";
import { MessageSquare, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const shellCopy: Record<string, { kicker: string; title: string; body: string; icon: any }> = {
  "/auth/login": {
    kicker: "Welcome back",
    title: "Your conversations are waiting.",
    body: "Messages, threads, and your whole team — all right where you left them. Sign in and pick up where you left off.",
    icon: MessageSquare,
  },
  "/auth/join": {
    kicker: "Join ChitChat",
    title: "Where great teams talk.",
    body: "Real-time messaging, organized threads, and zero noise. Create your account and start chatting in under a minute.",
    icon: Sparkles,
  },
  "/auth/verify": {
    kicker: "One last step",
    title: "Confirm it's really you.",
    body: "We sent a code to your inbox. Enter it to verify your identity and unlock your ChitChat workspace.",
    icon: ShieldCheck,
  },
  "/auth/reset-password": {
    kicker: "Account recovery",
    title: "Back to your messages, fast.",
    body: "Forgot your password? No worries. Set a new one in seconds and jump straight back into your conversations.",
    icon: Zap,
  },
  "/auth/active-sessions": {
    kicker: "Device limit reached",
    title: "Too many active chats.",
    body: "You're signed in on the maximum number of devices. Sign out of another session to continue chatting here.",
    icon: ShieldCheck,
  },
};

export function AuthShell() {
  const location = useLocation();
  const copy = shellCopy[location.pathname] ?? shellCopy["/auth/login"];
  const Icon = copy.icon;

  return (
    // Full-screen gradient — single source of truth for both panes
    <div className="auth-shell-bg relative h-screen overflow-hidden font-sans text-foreground selection:bg-primary selection:text-primary-foreground">

      {/* Shared animated orbs — red, green, yellow, pink */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Red — top left */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], rotate: [0, 60, 0], x: [-60, 80, -60] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-48 -top-48 h-[700px] w-[700px] rounded-full bg-red-400/30 blur-[160px]"
        />
        {/* Green — right center */}
        <motion.div
          animate={{ scale: [1, 1.25, 1], rotate: [0, -50, 0], y: [-60, 120, -60] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-48 top-1/4 h-[600px] w-[600px] rounded-full bg-green-400/25 blur-[140px]"
        />
        {/* Yellow — bottom center */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, 60, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] left-[20%] h-[500px] w-[500px] rounded-full bg-yellow-300/30 blur-[130px]"
        />
        {/* Pink — top right */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0], y: [0, -80, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[10%] -top-24 h-[500px] w-[500px] rounded-full bg-pink-400/25 blur-[150px]"
        />
      </div>

      <div className="relative z-10 grid h-full w-full md:grid-cols-[1fr_480px] lg:grid-cols-[1fr_540px] xl:grid-cols-[1fr_600px]">

        {/* Left: Branding pane — glass on top of shared gradient */}
        <aside className="hidden md:flex relative h-full flex-col overflow-hidden">

          <div className="relative flex h-full flex-col p-12 lg:p-16 xl:p-20">
            <Link to="/" className="flex items-center gap-3 w-fit group">
              <motion.div
                whileHover={{ rotate: -10, scale: 1.1 }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-2xl shadow-foreground/20"
              >
                <MessageSquare size={22} />
              </motion.div>
              <span className="text-xl font-bold tracking-tight text-foreground">ChitChat</span>
            </Link>

            <div className="mt-auto max-w-xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-10"
                >
                  <div className="inline-flex items-center gap-2 rounded-full bg-foreground/5 border border-foreground/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                    <Icon size={14} className="text-foreground" />
                    {copy.kicker}
                  </div>

                  <h1 className="text-6xl lg:text-7xl xl:text-8xl font-black leading-[0.9] tracking-tighter text-foreground">
                    {copy.title}
                  </h1>

                  <p className="text-xl leading-relaxed text-muted-foreground max-w-md font-medium">
                    {copy.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* Right: Form pane — glass on top of same gradient */}
        <main className="relative h-full overflow-y-auto custom-scrollbar flex items-center">

          <div className="relative z-10 w-full px-6 py-12 sm:px-12 md:px-16 lg:px-20">
            {/* Mobile Header */}
            <div className="mb-12 flex items-center justify-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <MessageSquare size={18} />
              </div>
              <span className="text-lg font-bold tracking-tight">ChitChat</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
