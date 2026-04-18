import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Home, ArrowLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/shared/ui/FormControls";

export function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Application Error";
  let message = "Something went wrong in the digital workspace.";
  let code = "500";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Section Not Found";
      message = "The requested path does not exist in your workspace.";
      code = "404";
    } else if (error.status === 401) {
      title = "Access Denied";
      message = "You don't have the permissions to access this segment.";
      code = "401";
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-slate-950 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex w-full max-w-xl flex-col items-center text-center"
      >
        {/* Background Decorative Element */}
        <div className="absolute -top-24 -z-10 h-64 w-64 rounded-full bg-slate-50 blur-3xl" />

        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[32px] bg-slate-900 text-white shadow-2xl shadow-slate-900/20">
          <AlertTriangle size={40} className="text-rose-400" />
        </div>

        <span className="mb-4 text-xs font-black uppercase tracking-[0.4em] text-slate-400">
          Security Protocol Error {code}
        </span>
        
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
          {title}
        </h1>
        
        <p className="mb-12 max-w-sm text-lg font-medium leading-relaxed text-slate-500">
          {message}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Button 
            onClick={() => navigate("/settings/profile")} 
            className="w-full sm:w-auto px-10"
            leftIcon={<Home size={18} />}
          >
            Return to Safety
          </Button>
          <Button 
            variant="outline"
            onClick={() => window.location.reload()} 
            className="w-full sm:w-auto px-10"
            leftIcon={<RefreshCcw size={18} />}
          >
            Reset Segment
          </Button>
        </div>

        <button 
          onClick={() => navigate(-1)}
          className="mt-12 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Previous View
        </button>
      </motion.div>

      {/* Footer Branding */}
      <footer className="mt-20 flex items-center gap-3 opacity-30">
        <div className="h-6 w-6 rounded-lg bg-slate-900" />
        <span className="font-bold tracking-tighter text-slate-950">CHITCHAT OS</span>
      </footer>
    </div>
  );
}
