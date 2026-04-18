
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020617] overflow-hidden">
      {/* Cinematic Background Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#0f172a_0%,_#020617_100%)] opacity-80" />

      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }} />

      <div className="relative flex flex-col items-center gap-8 animate-fade-in-up">
        {/* Premium Pulsing Loader */}
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/20 animate-pulse-soft" />
          <div className="absolute inset-4 rounded-xl border-2 border-emerald-500/40 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_15px_#10b981]" />
          </div>
        </div>

        {/* Status Text */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-500/80 uppercase">
            System Initializing
          </span>
          <p className="text-sm text-slate-400 font-medium tracking-wide">
            Securing connection & sessions...
          </p>
        </div>
      </div>

      {/* Subtle Footer Branding */}
      <div className="absolute bottom-10 flex items-center gap-3 opacity-20">
        <div className="h-[1px] w-8 bg-slate-500" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">ChitChat ADX</span>
        <div className="h-[1px] w-8 bg-slate-500" />
      </div>
    </div>
  );
}
