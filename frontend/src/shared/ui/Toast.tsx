import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X 
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

// --- Store ---

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (type, message, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }]
    }));
    
    if (duration !== Infinity) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id)
        }));
      }, duration);
    }
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  })),
}));

// --- Pure Utility ---

export const toast = {
  success: (msg: string, dur?: number) => useToastStore.getState().addToast("success", msg, dur),
  error: (msg: string, dur?: number) => useToastStore.getState().addToast("error", msg, dur),
  info: (msg: string, dur?: number) => useToastStore.getState().addToast("info", msg, dur),
  warning: (msg: string, dur?: number) => useToastStore.getState().addToast("warning", msg, dur),
};

// --- Components ---

const TOAST_ICONS = {
  success: <CheckCircle size={18} className="text-success" />,
  error: <AlertCircle size={18} className="text-destructive" />,
  info: <Info size={18} className="text-primary" />,
  warning: <AlertTriangle size={18} className="text-warning-500" />,
};

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.removeToast);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={cn(
        "group relative flex min-w-[320px] max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-2xl premium-glass",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:transition-all",
        {
          "before:bg-success": toast.type === "success",
          "before:bg-destructive": toast.type === "error",
          "before:bg-primary": toast.type === "info",
          "before:bg-amber-500": toast.type === "warning",
        }
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 transition-colors group-hover:bg-muted">
        {TOAST_ICONS[toast.type]}
      </div>
      
      <div className="flex-1 space-y-0.5">
        <p className="text-[13px] font-bold text-foreground leading-tight">
          {toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}
        </p>
        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
          {toast.message}
        </p>
      </div>

      <button
        onClick={() => remove(toast.id)}
        className="p-1 rounded-lg text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-all"
      >
        <X size={14} />
      </button>

      {/* Progress Bar */}
      {toast.duration !== Infinity && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-muted/20">
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: (toast.duration || 4000) / 1000, ease: "linear" }}
            className={cn("h-full", {
              "bg-success/50": toast.type === "success",
              "bg-destructive/50": toast.type === "error",
              "bg-primary/50": toast.type === "info",
              "bg-amber-500/50": toast.type === "warning",
            })}
          />
        </div>
      )}
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
