import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Home, ArrowLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/shared/ui/FormControls";
import { useEffect, useState } from "react";
import { runBootstrapRefresh } from "@/modules/auth/utils/authFlows";

export function ErrorPage({ mode }: { mode?: "offline" | "default" }) {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Oops! We hit a snag.";
  let message = "Something didn't go quite right on our end. Let's get you back on track.";
  let code = "500";

  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (mode !== "offline") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void runBootstrapRefresh();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode]);

  if (mode === "offline") {
    title = "Server Connection Lost";
    message = `We're having trouble reaching our servers right now. Retrying in ${countdown}s...`;
    code = "OFFLINE";
  } else if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Lost in space?";
      message = "We couldn't find the page you're looking for. It might have moved or never existed.";
      code = "404";
    } else if (error.status === 403 || error.status === 401) {
      title = "Wait a moment...";
      message = "It looks like you don't have permission to enter this area just yet.";
      code = "401";
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex w-full max-w-xl flex-col items-center text-center"
      >
        {/* Background Decorative Element */}
        <div className="absolute -top-24 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[32px] bg-primary text-primary-foreground shadow-2xl shadow-primary/20">
          <AlertTriangle size={40} className="text-destructive-foreground" />
        </div>

        <span className="mb-4 text-xs font-black uppercase tracking-[0.4em] text-muted-foreground">
          Something went wrong • {code}
        </span>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          {title}
        </h1>

        <p className="mb-12 max-w-sm text-lg font-medium leading-relaxed text-muted-foreground">
          {message}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Button
            onClick={() => navigate("/")}
            className="w-full sm:w-auto px-10"
            leftIcon={<Home size={18} />}
          >
            Take Me Home
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setCountdown(10);
              void runBootstrapRefresh();
            }}
            className="w-full sm:w-auto px-10"
            leftIcon={<RefreshCcw size={18} />}
          >
            Try Again
          </Button>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="mt-12 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} /> Go back a step
        </button>
      </motion.div>

      {/* Footer Branding */}
      <footer className="mt-20 flex items-center gap-3 opacity-30">
        <div className="h-6 w-6 rounded-lg bg-foreground" />
        <span className="font-bold tracking-tighter text-foreground uppercase">CHITCHAT OS</span>
      </footer>
    </div>
  );
}
