import { MessageCircle, Users, Settings, LogOut } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { logoutFlow } from "@/features/sessions/flows";
import { toast } from "@/shared/ui/Toast";
import { useState, useEffect } from "react";
import { fetchProfile } from "@/features/settings/api";
import { UserProfile } from "@/features/settings/types";

const NAV_ITEMS = [
  { id: "chats", label: "Chats", icon: MessageCircle, path: "/chats" },
  { id: "contacts", label: "Contacts", icon: Users, path: "/contacts" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

export function MainAppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Extract the root app feature (chats, contacts, settings) for transition keys
  const currentAppSection = location.pathname.split('/')[1] || "home";

  useEffect(() => {
    fetchProfile().then(d => { if (d.success && d.data) setProfile(d.data); });
  }, []);

  async function handleLogout() {
    await logoutFlow();
    toast.info("Logged out successfully.");
    navigate("/auth/login");
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
      
      {/* Global Navigation Rail */}
      <nav className="flex w-[72px] flex-col items-center justify-between border-r border-border bg-card/50 py-6 z-50 shrink-0 hidden md:flex">
        
        {/* Top Section */}
        <div className="flex flex-col items-center gap-6">
          {/* App Logo / Brand */}
          <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 mb-2">
            <MessageCircle size={22} className="fill-current" />
          </div>

          {/* Primary Nav Items */}
          <div className="flex flex-col gap-4">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className="relative group flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200"
                >
                  {/* Tooltip */}
                  <div className="absolute left-full ml-4 hidden rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 group-hover:block z-50 pointer-events-none whitespace-nowrap shadow-xl">
                    {item.label}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-foreground" />
                  </div>

                  <div className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleLogout}
            className="group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200"
          >
            <div className="absolute left-full ml-4 hidden rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 group-hover:block z-50 pointer-events-none whitespace-nowrap shadow-xl">
              Logout
              <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-foreground" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-all duration-300 group-hover:bg-destructive/10 group-hover:text-destructive">
              <LogOut size={20} />
            </div>
          </button>
          
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border border-border/50 cursor-pointer transition-transform hover:scale-105" onClick={() => navigate("/settings/profile")}>
            {profile?.profile_picture
              ? <img src={profile.profile_picture} className="h-full w-full object-cover" />
              : <div className="text-primary font-bold text-sm uppercase">{profile?.full_name?.charAt(0) || "U"}</div>}
          </div>
        </div>
      </nav>

      {/* Main Feature Area (Contacts Layout, Settings Layout, etc.) */}
      <main className="flex-1 overflow-hidden relative bg-background flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentAppSection}
            initial={{ opacity: 0, scale: 0.99, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.99, filter: "blur(2px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-1 w-full h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation (Visible only on small screens) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-card/95 backdrop-blur-md z-50 flex items-center justify-around px-4 pb-safe">
         {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.id}
                to={item.path}
                className="flex flex-col items-center justify-center w-16 h-full gap-1"
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={cn(
                  "text-[10px] font-bold tracking-tight",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>{item.label}</span>
              </NavLink>
            );
          })}
      </nav>
    </div>
  );
}
