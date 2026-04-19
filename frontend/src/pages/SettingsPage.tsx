import { useState, useEffect } from "react";
import { User, Shield, Activity, Bell, LogOut, ChevronRight, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { logoutFlow } from "@/features/sessions/flows";
import { cn } from "@/shared/lib/utils";

const tabs = [
  { id: "profile", label: "Profile", icon: User, path: "/settings/profile", desc: "Your identity & contact details" },
  { id: "security", label: "Security", icon: Shield, path: "/settings/security", desc: "Protection & access control" },
  { id: "devices", label: "Devices", icon: Activity, path: "/settings/devices", desc: "Active logins & session safety" },
  { id: "notifications", label: "Alerts", icon: Bell, path: "/settings/notifications", desc: "System & message updates" },
] as const;

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenu, setIsMobileMenu] = useState(true);

  // Sync mobile menu state with route depth
  useEffect(() => {
    const isRootSettings = location.pathname === "/settings" || location.pathname === "/settings/";
    setIsMobileMenu(isRootSettings);

    // On desktop, auto-redirect /settings to /settings/profile
    if (isRootSettings && window.innerWidth >= 1024) {
      navigate("/settings/profile", { replace: true });
    }
  }, [location.pathname, navigate]);

  async function handleLogout() {
    await logoutFlow();
    navigate("/auth/login");
  }

  const activeTab = tabs.find(t => location.pathname.startsWith(t.path)) || tabs[0];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar - Desktop (Integrated) & Mobile (List) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-full border-r border-border bg-background transition-all duration-500 lg:static lg:h-full lg:w-[260px] lg:translate-x-0",
          !isMobileMenu && "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Account Header */}
          <div className="p-6 pb-4">
            <div className="mb-6 flex items-center justify-between">
              <button
                onClick={() => navigate("/settings/profile")}
                className="group flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-foreground hover:text-background"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Console</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="mt-1 text-xs font-medium text-muted-foreground/80">System configuration.</p>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-3 custom-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname.startsWith(tab.path);

              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  className={({ isActive: linkActive }) => cn(
                    "group flex items-center justify-between rounded-xl p-3 transition-all duration-200",
                    linkActive 
                      ? "bg-primary/5 text-primary border border-primary/10" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "bg-muted text-muted-foreground group-hover:bg-background group-hover:shadow-sm"
                    )}>
                      <Icon size={18} />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold tracking-tight">{tab.label}</p>
                      <p className={cn(
                        "text-[9px] font-medium tracking-wide",
                        isActive ? "text-primary/70" : "text-muted-foreground/60 group-hover:text-foreground/80"
                      )}>
                        {tab.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={14} className={cn("transition-transform opacity-30", isActive ? "translate-x-1 opacity-100" : "group-hover:opacity-60")} />
                </NavLink>
              );
            })}
          </nav>

          {/* Logout Section */}
          <div className="mt-auto p-3 border-t border-border/50">
            <button
              onClick={handleLogout}
              className="group flex w-full items-center gap-3 rounded-xl p-3 text-destructive transition-all hover:bg-destructive/5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/5 text-destructive transition-colors group-hover:bg-destructive/10">
                <LogOut size={18} />
              </div>
              <span className="text-xs font-bold tracking-tight">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={cn(
          "fixed inset-0 z-50 flex h-full w-full flex-col bg-muted transition-all duration-500 lg:static lg:z-auto lg:h-full lg:flex-1 lg:translate-x-0",
          isMobileMenu && "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sub-page Header (Mobile only) */}
        <div className="flex items-center gap-3 border-b border-border bg-background/80 p-4 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => navigate("/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h2 className="text-base font-bold tracking-tight">{activeTab.label}</h2>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex min-h-full w-full flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 border border-border bg-background p-6 shadow-sm lg:p-10"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
