import { motion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Message } from "../../state/chatStore";

interface MessageItemProps {
  msg: Message;
  isMine: boolean;
  isFirstInGroup: boolean;
  currentChat: any;
  currentUserId: string;
  onReply: (msg: Message) => void;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onViewMedia: (msg: Message) => void;
}

export function MessageItem({
  msg,
  isMine,
  isFirstInGroup,
  currentChat,
  currentUserId,
  onReply,
  onContextMenu,
  onViewMedia
}: MessageItemProps) {
  
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      data-seq={msg.sequence_id}
      data-mine={isMine}
      data-status={msg.status}
      onContextMenu={(e) => onContextMenu(e, msg)}
      initial={isFirstInGroup ? { opacity: 0, y: 10, scale: 0.97 } : { opacity: 0, x: isMine ? 10 : -10 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex flex-col max-w-[85%] lg:max-w-[70%]",
        isMine ? "ml-auto items-end" : "items-start",
        isFirstInGroup ? "mt-4" : "mt-1"
      )}
    >
      {isFirstInGroup && !isMine && currentChat?.type === "GROUP" && (
        <span className="text-[10px] font-bold text-muted-foreground ml-3 mb-1 uppercase tracking-wider">
          {msg.sender_name || "User"}
        </span>
      )}

      <div className={cn(
        "relative group/msg transition-all duration-300 ease-out",
        "flex flex-col shadow-sm",
        isMine
          ? cn(
            "bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground",
            "shadow-[0_4px_12px_rgba(var(--primary-rgb),0.15)]",
            isFirstInGroup ? "rounded-2xl rounded-tr-none" : "rounded-2xl rounded-r-lg"
          )
          : cn(
            "bg-card/80 dark:bg-muted/40 backdrop-blur-md border border-border/50",
            isFirstInGroup ? "rounded-2xl rounded-tl-none" : "rounded-2xl rounded-l-lg"
          ),
        msg.attachments?.length === 1 && msg.attachments[0].type === "IMAGE" && !msg.content && "p-0 overflow-hidden"
      )}>
        {isFirstInGroup && (
          <div className={cn(
            "absolute top-0 w-3 h-3 overflow-hidden",
            isMine ? "-right-2" : "-left-2"
          )}>
            <div className={cn(
              "w-full h-full",
              isMine 
                ? "bg-primary [clip-path:polygon(0_0,0_100%,100%_0)]" 
                : "bg-card/80 dark:bg-muted/40 backdrop-blur-md [clip-path:polygon(100%_0,100%_100%,0_0)]"
            )} />
          </div>
        )}

        {msg.reply_to && (
          <div className="mx-2 mt-2 p-2 bg-black/5 dark:bg-white/5 border-l-4 border-primary rounded-r-lg mb-1 cursor-pointer hover:bg-black/10 transition-colors"
               onClick={() => {
                 const el = document.querySelector(`[data-seq="${msg.reply_to?.sequence_id}"]`);
                 el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
               }}>
            <p className="text-[10px] font-bold text-primary truncate">
              {msg.reply_to.sender_id === currentUserId ? "You" : msg.reply_to.sender_name}
            </p>
            <p className="text-xs text-muted-foreground truncate opacity-80">{msg.reply_to.content || (msg.reply_to.attachments?.length ? "Attachment" : "")}</p>
          </div>
        )}

        {msg.forwarded_from && (
          <div className="px-4 pt-2 flex items-center gap-1 opacity-60">
            <RotateCcw size={10} className="rotate-180" />
            <span className="text-[10px] font-bold italic uppercase tracking-wider">Forwarded</span>
          </div>
        )}

        {msg.attachments && msg.attachments.length > 0 && (
          <div className={cn(
            "grid gap-1",
            msg.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1",
            msg.content ? "p-1 pb-0" : "p-0"
          )}>
            {msg.attachments.map((att) => (
              <div key={att.id || att.storage_key} className="relative group/att overflow-hidden">
                {att.type === "IMAGE" && (
                  <div onClick={() => onViewMedia({ ...msg, metadata: { ...msg.metadata, attachment: att } })} className="relative group/img overflow-hidden cursor-pointer">
                    <img
                      src={att.local_url || att.metadata?.thumbnail_url || `/api/v1/media/proxy?key=${att.storage_key}`}
                      className={cn(
                        "max-h-[400px] w-full object-cover transition-all duration-500 hover:scale-[1.02]",
                        !att.is_processed && !att.local_url && "blur-lg grayscale"
                      )}
                    />
                    {att.progress !== undefined && att.progress < 100 && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                         <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}
                {/* Other attachment types simplified for now */}
              </div>
            ))}
          </div>
        )}

        {msg.content && (
          <div className={cn(
            "px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
            msg.attachments?.length > 0 && "pt-2"
          )}>
            {msg.content}
            {msg.is_edited && (
              <span className="text-[9px] opacity-40 ml-1 font-bold italic tracking-tighter">(edited)</span>
            )}
          </div>
        )}

        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
          <button onClick={() => onReply(msg)} className="h-6 w-6 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all">
            <RotateCcw size={12} className="rotate-180" />
          </button>
        </div>
      </div>

      <div className={cn(
        "flex items-center gap-1.5 mt-1 px-1 transition-all duration-300",
        isFirstInGroup ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 group-hover/msg:opacity-100 group-hover/msg:translate-y-0"
      )}>
        <span className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-tighter">
          {formatTime(msg.sent_at)}
        </span>
        {isMine && (
          <div className="flex items-center ml-0.5">
            {msg.status === "sending" ? (
              <div className="h-2 w-2 rounded-full bg-primary/20 animate-pulse" />
            ) : msg.status === "failed" ? (
              <span className="text-[9px] text-destructive font-black">!</span>
            ) : (
              <div className={cn(
                "flex items-center transition-colors duration-500",
                msg.status === "read" ? "text-blue-500" : "text-muted-foreground/30"
              )}>
                <Check size={10} strokeWidth={4} />
                {(msg.status === "delivered" || msg.status === "read") && (
                  <Check size={10} strokeWidth={4} className="-ml-1.5" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
