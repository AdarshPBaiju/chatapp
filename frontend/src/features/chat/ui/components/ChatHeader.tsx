import { ArrowLeft, Phone, Video, Info } from "lucide-react";
import { cn } from "@/shared/lib/utils";
interface ChatHeaderProps {
  currentChat: any;
  onlineUsers: Set<string>;
  lastSeen: Record<string, number>;
  onBack: () => void;
  currentUserId: string;
}

export function ChatHeader({
  currentChat,
  onlineUsers,
  lastSeen,
  onBack,
  currentUserId
}: ChatHeaderProps) {
  
  const isSameUser = (a?: string | null, b?: string | null) => {
    return a?.toLowerCase() === b?.toLowerCase();
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const otherUser = currentChat?.participants?.find((p: any) => !isSameUser(p.user_id, currentUserId));
  const otherUserId = otherUser?.user_id?.toLowerCase();
  const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
  const lastSeenTime = otherUserId ? lastSeen[otherUserId] : null;

  return (
    <header className="h-[72px] border-b border-border px-6 flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="lg:hidden h-9 w-9 rounded-xl bg-muted flex items-center justify-center mr-2"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold overflow-hidden">
          {currentChat?.display_avatar ? (
            <img src={currentChat.display_avatar} alt={currentChat.display_name} className="h-full w-full object-cover" />
          ) : (
            currentChat?.display_name.charAt(0)
          )}
        </div>
        <div>
          <p className="font-bold text-sm tracking-tight">{currentChat?.display_name}</p>
          {currentChat?.typingUsers && currentChat.typingUsers.size > 0 ? (
            <p className="text-[10px] text-primary font-bold animate-pulse">Typing...</p>
          ) : (
            <p className={cn(
              "text-[10px] font-bold flex items-center gap-1",
              isOnline ? "text-green-500" : "text-muted-foreground/60"
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full bg-current",
                isOnline && "animate-pulse"
              )} />
              {isOnline ? "Online" : (lastSeenTime ? `Last seen ${formatTime(lastSeenTime)}` : "Offline")}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center cursor-pointer transition-colors">
          <Phone size={18} className="text-muted-foreground" />
        </div>
        <div className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center cursor-pointer transition-colors">
          <Video size={18} className="text-muted-foreground" />
        </div>
        <div className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center cursor-pointer transition-colors">
          <Info size={18} className="text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
