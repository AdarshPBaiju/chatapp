export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden">
      {/* Cinematic Background Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_theme(colors.card)_0%,_theme(colors.background)_100%)] opacity-80" />
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }} />

      <div className="relative flex flex-col items-center gap-8 animate-fade-in-up">
        {/* Premium Pulsing Loader */}
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 animate-pulse-soft" />
          <div className="absolute inset-4 rounded-xl border-2 border-primary/40 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
          </div>
        </div>

        {/* Status Text */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.3em] text-primary/80 uppercase">
            System Initializing
          </span>
          <p className="text-sm text-muted-foreground font-medium tracking-wide">
            Securing connection & sessions...
          </p>
        </div>
      </div>

      {/* Subtle Footer Branding */}
      <div className="absolute bottom-10 flex items-center gap-3 opacity-20">
        <div className="h-[1px] w-8 bg-muted-foreground" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">ChitChat ADX</span>
        <div className="h-[1px] w-8 bg-muted-foreground" />
      </div>
    </div>
  );
}
