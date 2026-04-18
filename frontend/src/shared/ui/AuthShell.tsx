import { Outlet, useLocation, Link } from "react-router-dom";
import { MessageSquare, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const shellCopy: Record<string, { kicker: string; title: string; body: string; icon: any }> = {
  "/auth/login": {
    kicker: "Secure Access",
    title: "Reconnect with your team instantly.",
    body: "Jump right back into your conversations. Simple, secure, and blazing fast authentication.",
    icon: ShieldCheck,
  },
  "/auth/join": {
    kicker: "New Chapter",
    title: "Start chatting in seconds.",
    body: "Create your account and experience a new standard in team communication.",
    icon: Sparkles,
  },
  "/auth/verify": {
    kicker: "Safety First",
    title: "Keeping your chats secure.",
    body: "Enter the code sent to your device to verify your identity and protect your conversations.",
    icon: ShieldCheck,
  },
  "/auth/reset-password": {
    kicker: "Recovery",
    title: "Get back to your messages.",
    body: "We'll help you securely reset your password so you don't miss any important team updates.",
    icon: Zap,
  },
  "/auth/active-sessions": {
    kicker: "Session Limit",
    title: "Manage your active devices.",
    body: "You've reached your device limit. Sign out elsewhere to continue chatting here.",
    icon: ShieldCheck,
  },
};

export function AuthShell() {
  const location = useLocation();
  const copy = shellCopy[location.pathname] ?? shellCopy["/auth/login"];
  const Icon = copy.icon;

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-950 font-sans selection:bg-slate-900 selection:text-white">
      <div className="grid h-full w-full md:grid-cols-[1fr_480px] lg:grid-cols-[1fr_540px] xl:grid-cols-[1fr_600px]">
        {/* Cinematic Side Panel */}
        <aside className="hidden md:block relative h-full overflow-hidden bg-slate-900 border-r border-slate-800 shadow-[20px_0_40px_rgba(0,0,0,0.1)]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 45, 0],
                x: [-100, 50, -100]
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-violet-600/20 blur-[120px]" 
            />
            <motion.div 
              animate={{ 
                scale: [1, 1.3, 1],
                rotate: [0, -30, 0],
                y: [-50, 100, -50]
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-40 top-1/2 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[110px]" 
            />
            <motion.div 
              animate={{ 
                opacity: [0.1, 0.3, 0.1],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-[-10%] left-[20%] h-[400px] w-[400px] rounded-full bg-indigo-600/20 blur-[100px]" 
            />
            
            {/* Mesh Overlay */}
            <div className="absolute inset-0 bg-slate-950/40" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_rgba(255,255,255,0.03)_0%,_transparent_50%)]" />
          </div>

          <div className="relative flex h-full flex-col p-12 lg:p-16 xl:p-20">
            <Link to="/" className="flex items-center gap-3 w-fit group">
              <motion.div 
                whileHover={{ rotate: -10, scale: 1.1 }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-2xl shadow-white/10"
              >
                <MessageSquare size={22} />
              </motion.div>
              <span className="text-xl font-bold tracking-tight text-white">ChitChat</span>
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
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.3em] text-white/80">
                    <Icon size={14} className="text-emerald-400" />
                    {copy.kicker}
                  </div>

                  <h1 className="text-6xl lg:text-7xl xl:text-8xl font-black leading-[0.9] tracking-tighter text-white">
                    {copy.title}
                  </h1>

                  <p className="text-xl leading-relaxed text-slate-400 max-w-md font-medium">
                    {copy.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="h-full overflow-y-auto custom-scrollbar flex items-center bg-slate-50/50">
          <div className="w-full px-6 py-12 sm:px-12 md:px-16 lg:px-20">
            {/* Mobile Header */}
            <div className="mb-12 flex items-center justify-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
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
