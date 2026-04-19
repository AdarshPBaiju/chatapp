/**
 * AlertDialog — Premium Reusable Alert System
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *  • Imperative API:  alertDialog.show({ ... })
 *  • Arbitrary buttons array — unlimited, fully customizable per-button
 *  • 4 variants: info | warning | danger | success
 *  • 4 sizes: sm | md | lg | xl
 *  • Per-button: label, icon, variant, onClick, closeOnClick, disabled, loading
 *  • Optional custom body content (ReactNode)
 *  • Keyboard: Enter → first primary button, Escape → dismiss
 *  • Framer-motion spring animations + backdrop blur
 *  • Theme-aware: uses CSS variables from ThemeProvider
 *  • Top accent bar (variant colour)
 *  • Shimmer + glow effects on danger/warning
 */

import { forwardRef, useEffect, useCallback, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertVariant = "info" | "warning" | "danger" | "success";
export type AlertSize    = "sm" | "md" | "lg" | "xl";

export interface AlertButton {
  /** The button label */
  label: string;
  /** Optional icon rendered to the left of the label */
  icon?: ReactNode;
  /** Controls the button's visual style */
  variant?: "primary" | "outline" | "ghost" | "danger" | "success" | "warning";
  /** Called when this button is clicked. May be async → shows a spinner. */
  onClick?: () => void | Promise<void>;
  /** If true (default), the dialog closes after onClick resolves */
  closeOnClick?: boolean;
  /** Prevents interaction */
  disabled?: boolean;
  /** Hint for keyboard shortcut — "enter" auto-triggers on Enter key */
  keyboardTrigger?: "enter" | "escape";
}

export interface AlertOptions {
  /** Main heading */
  title: string;
  /** Optional supporting text */
  message?: string;
  /** Optional fully-custom body (replaces message if provided) */
  content?: ReactNode;
  /** Visual theme of the dialog */
  variant?: AlertVariant;
  /** Controls max-width */
  size?: AlertSize;
  /** Array of action buttons — rendered in order */
  buttons?: AlertButton[];
  /** Called when the dialog is dismissed via Escape or backdrop click */
  onDismiss?: () => void;
  /** Whether clicking the backdrop dismisses (default: true) */
  dismissOnBackdropClick?: boolean;
}

// ─── Internal Store ───────────────────────────────────────────────────────────

interface AlertStore {
  current: (AlertOptions & { id: string }) | null;
  show: (opts: AlertOptions) => void;
  dismiss: () => void;
}

const useAlertStore = create<AlertStore>((set) => ({
  current: null,
  show: (opts) =>
    set({
      current: { ...opts, id: Math.random().toString(36).slice(2, 9) },
    }),
  dismiss: () => set({ current: null }),
}));

// ─── Public Imperative API ────────────────────────────────────────────────────

export const alertDialog = {
  show: (opts: AlertOptions) => useAlertStore.getState().show(opts),
  dismiss: () => useAlertStore.getState().dismiss(),

  // ── Convenience shortcuts ──────────────────────────────────────────────────
  confirm: (opts: Omit<AlertOptions, "buttons"> & {
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
  }) => {
    const { confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, ...rest } = opts;
    useAlertStore.getState().show({
      ...rest,
      buttons: [
        {
          label: cancelLabel,
          variant: "outline",
          onClick: onCancel,
          closeOnClick: true,
          keyboardTrigger: "escape",
        },
        {
          label: confirmLabel,
          variant: rest.variant === "danger" ? "danger" : rest.variant === "warning" ? "warning" : "primary",
          onClick: onConfirm,
          closeOnClick: true,
          keyboardTrigger: "enter",
        },
      ],
    });
  },

  alert: (opts: Omit<AlertOptions, "buttons"> & { okLabel?: string; onOk?: () => void }) => {
    const { okLabel = "OK", onOk, ...rest } = opts;
    useAlertStore.getState().show({
      ...rest,
      buttons: [
        {
          label: okLabel,
          variant: "primary",
          onClick: onOk,
          closeOnClick: true,
          keyboardTrigger: "enter",
        },
      ],
    });
  },
};

// ─── Variant Config ───────────────────────────────────────────────────────────

const VARIANTS: Record<AlertVariant, {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  accentClass: string;
  glowClass: string;
}> = {
  danger: {
    icon: <ShieldAlert size={28} />,
    iconBg: "bg-destructive/10 dark:bg-destructive/15",
    iconColor: "text-destructive",
    accentClass: "bg-destructive",
    glowClass: "shadow-[0_0_40px_-10px_rgba(239,68,68,0.25)]",
  },
  warning: {
    icon: <AlertTriangle size={28} />,
    iconBg: "bg-amber-500/10 dark:bg-amber-500/15",
    iconColor: "text-amber-500",
    accentClass: "bg-amber-500",
    glowClass: "shadow-[0_0_40px_-10px_rgba(245,158,11,0.25)]",
  },
  info: {
    icon: <Info size={28} />,
    iconBg: "bg-primary/10 dark:bg-primary/15",
    iconColor: "text-primary",
    accentClass: "bg-primary",
    glowClass: "shadow-[0_0_40px_-10px_rgba(74,133,176,0.2)]",
  },
  success: {
    icon: <CheckCircle size={28} />,
    iconBg: "bg-success/10 dark:bg-success/15",
    iconColor: "text-success",
    accentClass: "bg-success",
    glowClass: "shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)]",
  },
};

// ─── Size Config ──────────────────────────────────────────────────────────────

const SIZES: Record<AlertSize, string> = {
  sm: "max-w-xs",
  md: "max-w-sm",
  lg: "max-w-md",
  xl: "max-w-lg",
};

// ─── Button Styles ─────────────────────────────────────────────────────────────

const BTN_STYLES: Record<NonNullable<AlertButton["variant"]>, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.2)] active:scale-[0.97]",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-muted hover:border-accent/40 active:scale-[0.97]",
  ghost:
    "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97]",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_4px_14px_-4px_rgba(239,68,68,0.4)] active:scale-[0.97]",
  success:
    "bg-success text-success-foreground hover:bg-success/90 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.4)] active:scale-[0.97]",
  warning:
    "bg-amber-500 text-white hover:bg-amber-500/90 shadow-[0_4px_14px_-4px_rgba(245,158,11,0.4)] active:scale-[0.97]",
};

// ─── Single Action Button ─────────────────────────────────────────────────────

function DialogButton({
  btn,
  onDismiss,
}: {
  btn: AlertButton;
  onDismiss: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const variant = btn.variant ?? "outline";

  const handleClick = useCallback(async () => {
    if (btn.disabled || loading) return;
    try {
      if (btn.onClick) {
        const result = btn.onClick();
        if (result instanceof Promise) {
          setLoading(true);
          await result;
        }
      }
    } finally {
      setLoading(false);
      if (btn.closeOnClick !== false) onDismiss();
    }
  }, [btn, loading, onDismiss]);

  return (
    <button
      type="button"
      disabled={btn.disabled || loading}
      onClick={handleClick}
      className={cn(
        "relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold tracking-wide",
        "transition-all duration-200 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        BTN_STYLES[variant]
      )}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        btn.icon && <span className="shrink-0">{btn.icon}</span>
      )}
      {btn.label}
    </button>
  );
}

// ─── Main Dialog Content ──────────────────────────────────────────────────────

const AlertDialogContent = forwardRef<HTMLDivElement>((_, ref) => {
  const { current, dismiss } = useAlertStore();

  const handleDismiss = useCallback(() => {
    current?.onDismiss?.();
    dismiss();
  }, [current, dismiss]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const escBtn = current.buttons?.find((b) => b.keyboardTrigger === "escape");
        if (escBtn?.onClick) escBtn.onClick();
        handleDismiss();
      }
      if (e.key === "Enter") {
        const enterBtn = current.buttons?.find((b) => b.keyboardTrigger === "enter");
        if (enterBtn) {
          e.preventDefault();
          enterBtn.onClick?.();
          if (enterBtn.closeOnClick !== false) handleDismiss();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, handleDismiss]);

  if (!current) return null;

  const v = VARIANTS[current.variant ?? "info"];
  const sizeClass = SIZES[current.size ?? "md"];
  const buttons = current.buttons;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
      role="alertdialog"
      aria-modal="true"
    >
      {/* ── Backdrop ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-foreground/20 dark:bg-black/40 backdrop-blur-[4px]"
        onClick={current.dismissOnBackdropClick !== false ? handleDismiss : undefined}
      />

      {/* ── Dialog Panel ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 12 }}
        transition={{ type: "spring", stiffness: 440, damping: 34, mass: 0.8 }}
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-2xl sm:rounded-[20px]",
          "bg-card border border-border",
          "shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)]",
          v.glowClass,
          sizeClass
        )}
      >
        {/* Top accent bar */}
        <div className={cn("absolute inset-x-0 top-0 h-[3px]", v.accentClass)} />

        {/* Subtle shimmer on danger/warning */}
        {(current.variant === "danger" || current.variant === "warning") && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]">
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.6, delay: 0.2, ease: "easeInOut" }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg]"
            />
          </div>
        )}

        <div className="p-6 pt-8 space-y-5">
          {/* ── Icon + Title + Message ── */}
          <div className="flex items-start gap-4">
            {/* Animated icon */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 22, delay: 0.05 }}
              className={cn(
                "shrink-0 h-12 w-12 rounded-xl flex items-center justify-center",
                v.iconBg,
                v.iconColor
              )}
            >
              {v.icon}
            </motion.div>

            <div className="flex-1 pt-0.5 space-y-1.5 min-w-0">
              <h2 className="text-[15px] font-bold text-foreground leading-snug tracking-tight">
                {current.title}
              </h2>
              {current.content ? (
                <div className="text-[12px] text-muted-foreground leading-relaxed">
                  {current.content}
                </div>
              ) : current.message ? (
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {current.message}
                </p>
              ) : null}
            </div>
          </div>

          {/* ── Divider ── */}
          {buttons && buttons.length > 0 && (
            <div className="h-px bg-border/60" />
          )}

          {/* ── Buttons ── */}
          {buttons && buttons.length > 0 && (
            <div
              className={cn(
                "flex gap-2",
                buttons.length > 2 ? "flex-col" : "flex-row"
              )}
            >
              {buttons.map((btn, i) => (
                <DialogButton key={i} btn={btn} onDismiss={handleDismiss} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
});

AlertDialogContent.displayName = "AlertDialogContent";

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AlertDialogProvider() {
  const { current } = useAlertStore();
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {current && <AlertDialogContent key={current.id} />}
    </AnimatePresence>,
    document.body
  );
}
