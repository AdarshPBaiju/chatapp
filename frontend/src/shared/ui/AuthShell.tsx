import { Outlet, useLocation } from "react-router-dom";
import { MessageSquare, Sparkles } from "lucide-react";

const shellCopy: Record<string, { kicker: string; title: string; body: string }> = {
  "/login": {
    kicker: "Welcome back",
    title: "Secure conversations start with a focused sign-in flow.",
    body: "Fast access, clean hierarchy, and a polished authentication experience built for everyday use.",
  },
  "/signup": {
    kicker: "Create account",
    title: "A cleaner onboarding flow for new users.",
    body: "Progressive signup steps, clear hierarchy, and a light visual system tuned for desktop and mobile.",
  },
  "/otp": {
    kicker: "Verification",
    title: "Confirm identity without breaking visual continuity.",
    body: "Verification stays clear and focused, with a consistent layout that avoids visual jumps between steps.",
  },
  "/forgot-password": {
    kicker: "Recovery",
    title: "Reset access with a calm, trustworthy interface.",
    body: "Recovery states are designed for readability, clarity, and confident progression on every screen size.",
  },
  "/session-gate": {
    kicker: "Session control",
    title: "Resolve device limits with clear next actions.",
    body: "Active session management stays clear, structured, and easy to understand without feeling crowded.",
  },
  "/change-password": {
    kicker: "Security",
    title: "Update credentials in the same consistent auth system.",
    body: "Shared structure, lighter surfaces, and reusable controls keep the security flow coherent and professional.",
  },
};

export function AuthShell() {
  const location = useLocation();
  const copy = shellCopy[location.pathname] ?? shellCopy["/login"];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] text-slate-950">
      <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
        <aside className="hidden lg:block relative overflow-hidden border-b border-white/70 bg-[linear-gradient(160deg,_rgba(255,255,255,0.94),_rgba(236,245,255,0.88))] px-4 py-6 sm:px-6 sm:py-8 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-10 lg:py-10 xl:px-14 xl:py-12">
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
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Auth System</p>
                </div>
              </div>

              <div className="hidden rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm sm:block">Light UI</div>
            </div>

            <div className="mt-8 flex-1 lg:mt-14">
              <div className="space-y-5 sm:max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 shadow-sm">
                  <Sparkles size={14} />
                  {copy.kicker}
                </span>

                <h1 className="max-w-none text-[clamp(2.9rem,14vw,4.4rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-slate-950 sm:max-w-[11ch] sm:text-[clamp(3.6rem,9vw,5.2rem)] lg:text-[clamp(3.25rem,5vw,5.5rem)]">
                  {copy.title}
                </h1>

                <p className="max-w-none text-sm leading-7 text-slate-600 sm:max-w-lg sm:text-base">
                  {copy.body}
                </p>
              </div>

              <div className="mt-8 overflow-hidden rounded-[24px] border border-white/70 bg-white/70 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.25)] backdrop-blur sm:mt-10 sm:rounded-[28px]">
                <div className="grid gap-0 sm:grid-cols-3">
                  <div className="border-b border-slate-200/70 p-5 sm:border-b-0 sm:border-r">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Fast access</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">Reduced friction for returning users.</p>
                  </div>
                  <div className="border-b border-slate-200/70 p-5 sm:border-b-0 sm:border-r">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Clear structure</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">Consistent spacing and form hierarchy.</p>
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Responsive</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">Balanced for mobile, tablet, and desktop.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-8rem)] items-start px-4 py-4 sm:px-6 sm:py-6 lg:min-h-screen lg:items-center lg:px-8 lg:py-8 xl:px-10">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
