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
  }, [location.pathname]);

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
          "fixed inset-y-0 left-0 z-40 w-full border-r border-border bg-background transition-all duration-500 lg:static lg:h-full lg:w-[380px] lg:translate-x-0",
          !isMobileMenu && "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Account Header */}
          <div className="p-8 pb-4 lg:p-10 lg:pb-6">
            <div className="mb-10 flex items-center justify-between">
              <button
                onClick={() => navigate("/settings/profile")}
                className="group flex h-10 w-10 items-center justify-center rounded-xl bg-muted transition-colors hover:bg-foreground hover:text-background"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Account Control</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="mt-2 text-sm font-medium text-muted-foreground">Manage your digital presence & safety.</p>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4 custom-scrollbar lg:p-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname.startsWith(tab.path);

              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  className={({ isActive: linkActive }) => cn(
                    "group flex items-center justify-between rounded-2xl p-4 transition-all duration-300",
                    linkActive 
                      ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/20 hover:bg-primary/95 hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-[0.98]" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300",
                      isActive 
                        ? "bg-primary-foreground/15 text-primary-foreground group-hover:bg-primary-foreground/25" 
                        : "bg-muted text-muted-foreground group-hover:bg-background group-hover:shadow-sm"
                    )}>
                      <Icon size={22} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold tracking-tight">{tab.label}</p>
                      <p className={cn(
                        "text-[10px] font-medium tracking-wide",
                        isActive ? "text-primary-foreground/60" : "text-muted-foreground group-hover:text-foreground/80"
                      )}>
                        {tab.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={cn("transition-transform", isActive ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                </NavLink>
              );
            })}
          </nav>

          {/* Logout Section */}
          <div className="mt-auto p-4 lg:p-6 border-t border-border/50">
            <button
              onClick={handleLogout}
              className="group flex w-full items-center gap-4 rounded-2xl p-4 text-destructive transition-all hover:bg-destructive/5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/5 text-destructive transition-colors group-hover:bg-destructive/10">
                <LogOut size={22} />
              </div>
              <span className="text-sm font-bold tracking-tight">Secure Logout</span>
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
        <div className="flex items-center gap-4 border-b border-border bg-background/80 p-6 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => navigate("/settings")}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold tracking-tight">{activeTab.label}</h2>
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
                className="flex-1 border border-border bg-background p-8 shadow-2xl shadow-primary/5 lg:p-14"
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
