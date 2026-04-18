import { Outlet, useLocation } from "react-router-dom";
import { MessageSquare, Sparkles } from "lucide-react";

const shellCopy: Record<string, { kicker: string; title: string; body: string }> = {
  "/login": {
    kicker: "Welcome back",
    title: "Reconnect with your team instantly.",
    body: "Jump right back into your conversations. Simple, secure, and blazing fast authentication.",
  },
  "/signup": {
    kicker: "Join ChitChat",
    title: "Start chatting in seconds.",
    body: "Create your account and experience a new standard in team communication.",
  },
  "/otp": {
    kicker: "Verification",
    title: "Keeping your chats secure.",
    body: "Enter the code sent to your device to verify your identity and protect your conversations.",
  },
  "/forgot-password": {
    kicker: "Account Recovery",
    title: "Get back to your messages.",
    body: "We'll help you securely reset your password so you don't miss any important team updates.",
  },
  "/session-gate": {
    kicker: "Session Limits",
    title: "Manage your active devices.",
    body: "You've reached your device limit. Sign out elsewhere to continue chatting here.",
  },
  "/change-password": {
    kicker: "Security Check",
    title: "Update your access credentials.",
    body: "Keep your workspace safe by maintaining a strong, unique password for your account.",
  },
};

export function AuthShell() {
  const location = useLocation();
  const copy = shellCopy[location.pathname] ?? shellCopy["/login"];

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] text-slate-950">
      <div className="grid h-full w-full md:grid-cols-[minmax(0,1fr)_minmax(380px,500px)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
        <aside className="hidden md:block relative h-full overflow-hidden border-r bg-[linear-gradient(160deg,_rgba(255,255,255,0.94),_rgba(236,245,255,0.88))] px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-14 xl:py-12">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-[-8%] h-72 w-72 rounded-full bg-sky-300/45 blur-3xl sm:h-96 sm:w-96" />
            <div className="absolute right-[-12%] top-[18%] h-48 w-48 rounded-full bg-violet-200/60 blur-3xl sm:h-72 sm:w-72" />
            <div className="absolute bottom-[-12%] left-[12%] h-64 w-64 rounded-full bg-cyan-200/55 blur-3xl sm:h-80 sm:w-80" />
            <div className="absolute inset-[10%] rounded-[32px] border border-white/50 max-lg:hidden" />
          </div>

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_20px_45px_-25px_rgba(15,23,42,0.7)]">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em]">ChitChat</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex-1 flex flex-col justify-center pb-8 lg:mt-14 lg:pb-14">
              <div className="space-y-5 sm:max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 shadow-sm">
                  <Sparkles size={14} />
                  {copy.kicker}
                </span>

                <h1 className="max-w-none text-[clamp(2.9rem,14vw,4.4rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-slate-950 sm:max-w-[11ch] sm:text-[clamp(3.6rem,9vw,5.2rem)] md:text-[clamp(2.8rem,5vw,5.5rem)] lg:text-[clamp(3.25rem,5vw,5.5rem)]">
                  {copy.title}
                </h1>

                <p className="max-w-none text-sm leading-7 text-slate-600 sm:max-w-lg sm:text-base">
                  {copy.body}
                </p>
              </div>


            </div>
          </div>
        </aside>

        <main className="h-full overflow-y-auto flex items-start px-4 py-8 sm:px-6 sm:py-10 md:items-center md:px-8 md:py-8 xl:px-10">
          <div className="w-full">
            <div className="mb-8 flex items-center justify-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-[0_10px_20px_-10px_rgba(15,23,42,0.5)]">
                <MessageSquare size={18} />
              </div>
              <div className="text-left">
                <p className="text-base font-semibold tracking-[-0.03em]">ChitChat</p>
              </div>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
