import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Smile, Send, X, Image as ImageIcon, FileText, Music } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Message } from "../../state/chatStore";

interface MessageInputProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onFileSelect: (filter: string) => void;
  selectedFile: File | null;
  onClearFile: () => void;
  replyTo: Message | null;
  onClearReply: () => void;
  isConnected: boolean;
  currentChat: any;
  currentUserId: string;
}

export function MessageInput({
  input,
  onInputChange,
  onSend,
  onFileSelect,
  selectedFile,
  onClearFile,
  replyTo,
  onClearReply,
  isConnected,
  currentChat,
  currentUserId
}: MessageInputProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isSameUser = (a?: string | null, b?: string | null) => {
    return a?.toLowerCase() === b?.toLowerCase();
  };

  return (
    <footer className="p-4 bg-background border-t border-border/50">
      {replyTo && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-center gap-3 p-3 bg-primary/5 rounded-xl border-l-4 border-primary"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">
              Replying to {isSameUser(replyTo.sender_id, currentUserId) ? "yourself" : replyTo.sender_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content || (replyTo.attachments?.length ? "Attachment" : "")}</p>
          </div>
          <button onClick={onClearReply} className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center">
            <X size={14} />
          </button>
        </motion.div>
      )}

      {selectedFile && (
        <div className="mb-3 flex items-center gap-3 p-2 bg-muted/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-2">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20">
            {selectedFile.type.startsWith("image/") ? (
              <img src={URL.createObjectURL(selectedFile)} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={20} className="text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate">{selectedFile.name}</p>
            <p className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={onClearFile} className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-3 bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-background p-2 rounded-2xl transition-all duration-300">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                "p-2.5 rounded-full transition-all duration-200",
                isMenuOpen ? "bg-primary text-primary-foreground scale-110 rotate-45" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Paperclip size={22} />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 z-40" />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
                    className="absolute bottom-14 left-0 z-50 bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-3 grid grid-cols-2 gap-2 min-w-[200px]"
                  >
                    <button onClick={() => { onFileSelect("image/*,video/*"); setIsMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group">
                      <div className="h-12 w-12 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><ImageIcon size={24} /></div>
                      <span className="text-xs font-bold">Gallery</span>
                    </button>
                    <button onClick={() => { onFileSelect("*/*"); setIsMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group">
                      <div className="h-12 w-12 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><FileText size={24} /></div>
                      <span className="text-xs font-bold">Document</span>
                    </button>
                    <button onClick={() => { onFileSelect("audio/*"); setIsMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group">
                      <div className="h-12 w-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Music size={24} /></div>
                      <span className="text-xs font-bold">Audio</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="p-2.5 text-muted-foreground hover:bg-muted rounded-full transition-colors"><Smile size={22} /></button>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${currentChat?.display_name || "..."}`}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none py-2.5 text-sm max-h-32 custom-scrollbar"
        />

        <button
          onClick={onSend}
          disabled={(!input.trim() && !selectedFile) || !isConnected}
          className={cn(
            "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95",
            (input.trim() || selectedFile) && isConnected
              ? "bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <Send size={18} />
        </button>
      </div>
    </footer>
  );
}
