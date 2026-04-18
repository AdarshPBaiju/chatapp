import { useState } from "react";
import { User, Shield, Activity, Bell, LogOut, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { logoutFlow } from "@/features/sessions/flows";
import { ProfileSection } from "@/features/settings/ui/ProfileSection";
import { SecuritySection } from "@/features/settings/ui/SecuritySection";
import { ActiveSessionsSection } from "@/features/settings/ui/ActiveSessionsSection";

type Tab = "profile" | "security" | "sessions" | "notifications";

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  async function handleLogout() {
    await logoutFlow();
    navigate("/login");
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: User, desc: "Personal information and bio" },
    { id: "security", label: "Security", icon: Shield, desc: "Password and 2FA settings" },
    { id: "sessions", label: "Active Sessions", icon: Activity, desc: "Manage your logged-in devices" },
    { id: "notifications", label: "Notifications", icon: Bell, desc: "Manage alerts and updates" },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Settings Header */}
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-slate-950 text-white rounded-lg flex items-center justify-center font-bold">C</div>
            <span className="font-bold text-slate-900">Settings</span>
          </div>
          <button 
            onClick={() => navigate("/dashboard")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Back to App
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Navigation Sidebar */}
          <aside className="w-full lg:w-72 space-y-2">
            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Account Hub</div>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 group ${
                    activeTab === tab.id 
                      ? 'bg-white shadow-xl shadow-slate-200/50 border-2 border-slate-100' 
                      : 'hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
                      activeTab === tab.id ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-900'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <div className="text-left">
                      <p className={`font-bold text-sm ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>
                        {tab.label}
                      </p>
                    </div>
                  </div>
                  {activeTab === tab.id && <ChevronRight size={16} className="text-slate-400" />}
                </button>
              );
            })}

            <div className="pt-8 border-t border-slate-200 mt-8">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-4 rounded-2xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"
              >
                <div className="h-10 w-10 rounded-xl bg-red-100/50 flex items-center justify-center">
                  <LogOut size={20} />
                </div>
                Logout Session
              </button>
            </div>
          </aside>

          {/* Content Area */}
          <section className="flex-1 bg-white border border-slate-100 rounded-[32px] shadow-sm p-6 md:p-10 min-h-[600px]">
            {activeTab === "profile" && <ProfileSection />}
            {activeTab === "security" && <SecuritySection />}
            {activeTab === "sessions" && <ActiveSessionsSection />}
            {activeTab === "notifications" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center">
                  <Bell size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xl">Communication Center</h3>
                  <p className="text-slate-500 max-w-xs mx-auto">Manage how we keep you updated on your team's progress. Coming soon.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
