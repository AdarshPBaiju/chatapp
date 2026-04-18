import { Outlet, useLocation } from "react-router-dom";
import { MessageSquare, ShieldCheck, Sparkles } from "lucide-react";

const shellCopy: Record<string, { kicker: string; title: string; body: string }> = {
  "/login": {
    kicker: "Welcome back",
    title: "Secure conversations start with a focused sign-in flow.",
    body: "Fast access, reduced friction, and a stable shell that stays in place while the auth route changes.",
  },
  "/signup": {
    kicker: "Create account",
    title: "A cleaner onboarding flow for new users.",
    body: "Progressive signup steps, clear hierarchy, and a light visual system tuned for desktop and mobile.",
  },
  "/otp": {
    kicker: "Verification",
    title: "Confirm identity without breaking visual continuity.",
    body: "The shell stays mounted so only the form state changes between steps and auth routes.",
  },
  "/forgot-password": {
    kicker: "Recovery",
    title: "Reset access with a calm, trustworthy interface.",
    body: "Every state is optimized for readability, spacing, and responsive behavior.",
  },
  "/session-gate": {
    kicker: "Session control",
    title: "Resolve device limits with clear next actions.",
    body: "A high-signal layout makes active session management feel deliberate instead of crowded.",
  },
  "/change-password": {
    kicker: "Security",
    title: "Update credentials in the same consistent auth system.",
    body: "Shared structure, lighter surfaces, and reusable controls keep the flow coherent.",
  },
};

export function AuthShell() {
  const location = useLocation();
  const copy = shellCopy[location.pathname] ?? shellCopy["/login"];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[minmax(420px,1.08fr)_minmax(0,0.92fr)]">
        <aside className="relative overflow-hidden border-b border-white/70 bg-[linear-gradient(160deg,_rgba(255,255,255,0.94),_rgba(236,245,255,0.88))] px-6 py-8 sm:px-8 sm:py-10 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-[-8%] h-72 w-72 rounded-full bg-sky-300/45 blur-3xl sm:h-96 sm:w-96" />
            <div className="absolute right-[-12%] top-[18%] h-48 w-48 rounded-full bg-violet-200/60 blur-3xl sm:h-72 sm:w-72" />
            <div className="absolute bottom-[-12%] left-[12%] h-64 w-64 rounded-full bg-cyan-200/55 blur-3xl sm:h-80 sm:w-80" />
            <div className="absolute inset-[12%] rounded-[40px] border border-white/60" />
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

              <div className="hidden rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm sm:block">
                Light UI
              </div>
            </div>

            <div className="mt-12 flex-1 lg:mt-16">
              <div className="max-w-xl space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 shadow-sm">
                  <Sparkles size={14} />
                  {copy.kicker}
                </span>

                <h1 className="max-w-lg text-4xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-5xl lg:text-6xl">
                  {copy.title}
                </h1>

                <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                  {copy.body}
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14">
                <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.35)] backdrop-blur">
                  <p className="text-sm font-semibold text-slate-900">Persistent route shell</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The visual panel remains mounted while auth pages swap on the right.
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.6)]">
                  <div className="flex items-center gap-2 text-sky-300">
                    <ShieldCheck size={18} />
                    <span className="text-sm font-semibold">Security-first flow</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Session control, recovery, verification, and password updates share one system.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">Responsive by default</span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">Optimized spacing</span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">Shared components</span>
            </div>
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-18rem)] items-center px-4 py-6 sm:px-6 sm:py-8 lg:min-h-screen lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-2xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
