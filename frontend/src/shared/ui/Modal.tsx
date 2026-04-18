import React, { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = "md" 
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 300,
              mass: 0.8
            }}
            className={cn(
              "relative w-full bg-white rounded-[40px] shadow-2xl overflow-hidden",
              maxWidthClasses[maxWidth]
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 md:p-8 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">{title}</h3>
              <button 
                onClick={onClose}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 md:p-8 max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
