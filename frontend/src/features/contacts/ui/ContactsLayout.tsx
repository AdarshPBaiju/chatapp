import { useState, useEffect } from "react";
import { Users, Clock, Search, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/lib/utils";

const tabs = [
  { id: "contacts", label: "My Contacts", icon: Users, path: "/app/contacts", exact: true, desc: "Your verified social network" },
  { id: "requests", label: "Requests", icon: Clock, path: "/app/contacts/requests", exact: false, desc: "Incoming friend requests" },
  { id: "discovery", label: "Discovery", icon: Search, path: "/app/contacts/discovery", exact: false, desc: "Find new people to connect" },
] as const;

export function ContactsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenu, setIsMobileMenu] = useState(true);

  // Sync mobile menu state with route depth
  useEffect(() => {
    const isRootContacts = location.pathname === "/app/contacts" || location.pathname === "/app/contacts/";
    setIsMobileMenu(isRootContacts);
  }, [location.pathname]);

  // @ts-ignore
  const activeTab = tabs.find(t => t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path)) || tabs[0];

  return (
    <div className="flex h-full w-full overflow-hidden bg-background font-sans text-foreground">
      {/* Feature Sidebar - Desktop & Mobile */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 w-full border-r border-border bg-background/50 backdrop-blur-xl transition-all duration-500 lg:static lg:h-full lg:w-[280px] lg:translate-x-0 lg:bg-background",
          !isMobileMenu && "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">People</h1>
            <p className="text-xs font-medium text-muted-foreground mt-1">Manage your connections</p>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4 custom-scrollbar mt-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              // @ts-ignore
              const isActive = tab.exact ? location.pathname === tab.path : location.pathname.startsWith(tab.path);

              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  className={cn(
                    "group flex items-center justify-between rounded-2xl p-3 transition-all duration-300 cursor-pointer mb-2",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "bg-muted text-muted-foreground group-hover:bg-background group-hover:shadow-sm group-hover:scale-105"
                    )}>
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                    <div className="text-left">
                      <p className={cn("text-sm font-bold tracking-tight", isActive && "text-foreground")}>{tab.label}</p>
                      <p className={cn(
                        "text-[10px] font-medium tracking-wide mt-0.5",
                        isActive ? "text-primary/70" : "text-muted-foreground/60 group-hover:text-foreground/80"
                      )}>
                        {tab.desc}
                      </p>
                    </div>
                  </div>
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
            onClick={() => navigate("/app/contacts")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-bold tracking-tight">{activeTab.label}</h2>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-card/10">
          <div className="flex min-h-full w-full flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 lg:p-10 p-4"
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
