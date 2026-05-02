import { useState, useEffect } from "react";
import { User, Shield, Lock, Activity, Bell, ChevronRight, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { fetchProfile } from "@/features/settings/api";
import { UserProfile } from "@/features/settings/types";
import { cn } from "@/shared/lib/utils";

const tabs = [
  { id: "profile", label: "Profile", icon: User, path: "/app/settings/profile", desc: "Your identity & contact details" },
  { id: "privacy", label: "Privacy", icon: Shield, path: "/app/settings/privacy", desc: "Invitation & visibility control" },
  { id: "security", label: "Security", icon: Lock, path: "/app/settings/security", desc: "Protection & access control" },
  { id: "devices", label: "Devices", icon: Activity, path: "/app/settings/devices", desc: "Active logins & session safety" },
  { id: "notifications", label: "Alerts", icon: Bell, path: "/app/settings/notifications", desc: "System & message updates" },
] as const;

export function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenu, setIsMobileMenu] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetchProfile().then(d => { if (d.success && d.data) setProfile(d.data); });
  }, []);

  // Sync mobile menu state with route depth
  useEffect(() => {
    const isRootSettings = location.pathname === "/app/settings" || location.pathname === "/app/settings/";
    setIsMobileMenu(isRootSettings);

    // On desktop, auto-redirect /settings to /settings/profile
    if (isRootSettings && window.innerWidth >= 1024) {
      navigate("/app/settings/profile", { replace: true });
    }
  }, [location.pathname, navigate]);

  const activeTab = tabs.find(t => location.pathname.startsWith(t.path)) || tabs[0];

  return (
    <div className="flex h-full w-full overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar - Desktop (Integrated) & Mobile (List) */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 w-full border-r border-border bg-background/50 backdrop-blur-xl transition-all duration-500 lg:static lg:h-full lg:w-[280px] lg:translate-x-0 lg:bg-background",
          !isMobileMenu && "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Account Header */}
          <div className="p-6 pb-4">
            <div className="mb-5 flex items-center gap-3">
              <button
                onClick={() => navigate("/app/settings/profile")}
                className="group flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-primary hover:text-primary-foreground cursor-pointer"
              >
                <ArrowLeft size={16} />
              </button>
            </div>

            {/* User profile identity in sidebar */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.profile_picture
                  ? <img src={profile.profile_picture} className="h-full w-full object-cover" />
                  : <User size={18} className="text-primary" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-foreground truncate">{profile?.full_name || "Loading..."}</p>
                <p className="text-[10px] font-medium text-muted-foreground truncate">{profile?.email}</p>
              </div>
            </div>

            <h1 className="mt-5 text-xl font-bold tracking-tight text-foreground">Settings</h1>
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
                    "group flex items-center justify-between rounded-xl p-3 transition-all duration-200 cursor-pointer",
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


        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={cn(
          "absolute inset-0 z-50 flex h-full w-full flex-col bg-background transition-all duration-500 lg:static lg:z-auto lg:h-full lg:flex-1 lg:translate-x-0",
          isMobileMenu && "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sub-page Header (Mobile only) */}
        <div className="flex items-center gap-3 border-b border-border bg-background p-4 lg:hidden">
          <button
            onClick={() => navigate("/app/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
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
