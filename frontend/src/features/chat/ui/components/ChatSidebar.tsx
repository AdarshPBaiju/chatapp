import { Search, MoreVertical, Paperclip } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Room } from "../../state/chatStore";

interface ChatSidebarProps {
  chatList: Room[];
  activeRoomId: string | null;
  pendingUser: any;
  isConnected: boolean;
  isLoading: boolean;
  onlineUsers: Set<string>;
  onSelectRoom: (roomId: string) => void;
  currentUserId: string;
}

export function ChatSidebar({
  chatList,
  activeRoomId,
  pendingUser,
  isConnected,
  isLoading,
  onlineUsers,
  onSelectRoom,
  currentUserId
}: ChatSidebarProps) {
  
  const isSameUser = (a?: string | null, b?: string | null) => {
    return a?.toLowerCase() === b?.toLowerCase();
  };

  return (
    <aside className={cn(
      "w-full lg:w-[350px] border-r border-border flex flex-col bg-card/10 backdrop-blur-sm transition-all",
      (activeRoomId || pendingUser) && "hidden lg:flex"
    )}>
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full transition-colors duration-500",
              isConnected ? "bg-green-500" : "bg-red-400 animate-pulse"
            )} />
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors">
              <MoreVertical size={16} className="text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" size={16} />
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full bg-muted/50 border-transparent focus:border-primary/20 focus:bg-background h-10 pl-10 pr-4 rounded-xl text-sm transition-all outline-none border"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
        {isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 w-full rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {chatList.map((chat) => (
          <div
            key={chat.id}
            onClick={() => onSelectRoom(chat.id)}
            className={cn(
              "group flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-200",
              activeRoomId === chat.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-muted/50"
            )}
          >
            <div className="relative shrink-0">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden border border-border/10">
                {chat.display_avatar ? (
                  <img src={chat.display_avatar} alt={chat.display_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-bold text-lg">{chat.display_name.charAt(0)}</span>
                )}
              </div>
              {chat.type === "DIRECT" && (() => {
                const otherUser = chat.participants?.find((p: any) => !isSameUser(p.user_id, currentUserId));
                if (otherUser?.user_id && onlineUsers.has(otherUser.user_id.toLowerCase())) {
                  return (
                    <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <p className="font-bold text-sm truncate">{chat.display_name}</p>
                <p className={cn("text-[10px]", activeRoomId === chat.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {chat.last_message ? new Date(chat.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </p>
              </div>
              <p className={cn("text-xs truncate", activeRoomId === chat.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {chat.last_message ? (
                  <>
                    {isSameUser(chat.last_message.sender_id, currentUserId) ? (
                      <span className="font-bold mr-1">You:</span>
                    ) : (
                      chat.type !== "DIRECT" && (
                        <span className="font-bold mr-1">{chat.last_message.sender_name}:</span>
                      )
                    )}
                    {chat.last_message.content || (
                      <span className="italic opacity-70 flex items-center gap-1">
                        <Paperclip size={10} /> Attachment
                      </span>
                    )}
                  </>
                ) : "No messages yet"}
              </p>
            </div>

            {chat.unread_count > 0 && activeRoomId !== chat.id && (
              <div className="h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {chat.unread_count}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
