import { motion, AnimatePresence } from "framer-motion";
import { } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  options: {
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "default" | "destructive";
  }[];
}

export function ContextMenu({ x, y, onClose, options }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ top: y, left: x }}
        className="fixed z-[100] min-w-[180px] bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-1.5 overflow-hidden"
      >
        <div className="flex flex-col gap-0.5">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                opt.onClick();
                onClose();
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                opt.variant === "destructive" 
                  ? "text-destructive hover:bg-destructive/10" 
                  : "text-foreground hover:bg-primary/10 hover:text-primary"
              )}
            >
              <opt.icon size={16} />
              {opt.label}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
