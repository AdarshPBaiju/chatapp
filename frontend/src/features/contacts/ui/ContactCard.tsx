import { MessageCircle, User, UserPlus, UserCheck, ShieldAlert } from "lucide-react";
import { ContactUser } from "../types";
import { Button } from "@/shared/ui/FormControls";
import { useState } from "react";
import { manageContact } from "../api";
import { toast } from "@/shared/ui/Toast";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { useChatStore } from "@/features/chat/state/chatStore";
import { startDirectChat } from "@/features/chat/api/startDirectChat";
import { useAuthStore } from "@/modules/auth/state/authState";

function normalizeUserId(id?: string | null) {
  return id ? id.toLowerCase() : "";
}

interface ContactCardProps {
  user: ContactUser;
  onActionComplete?: () => void;
}

export function ContactCard({ user, onActionComplete }: ContactCardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [chatStarting, setChatStarting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [nickname, setNickname] = useState("");
  const currentUserId = useAuthStore(state => state.user?.id);
  const onlineUsers = useChatStore(state => state.onlineUsers);
  const isSelf = normalizeUserId(user.user_id) === normalizeUserId(currentUserId);
  const isOnline = user.user_id ? onlineUsers.has(normalizeUserId(user.user_id)) : false;

  if (isSelf) {
    return null;
  }

  async function handleAction(action: "add" | "accept" | "decline" | "block" | "unblock" | "remove", customNickname?: string) {
    setLoading(true);
    try {
      const res = await manageContact(user.id, action, customNickname);
      if (res.success) {
        toast.success(res.message);
        setIsAccepting(false);
        onActionComplete?.();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error("Action failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartChat() {
    setChatStarting(true);
    try {
      const roomId = await startDirectChat(user.id);
      navigate(`/chats/${roomId}`);
    } catch (err) {
      toast.error("Could not start chat.");
    } finally {
      setChatStarting(false);
    }
  }

  return (
    <div className={cn(
        "group flex flex-col gap-2 p-4 rounded-2xl border transition-all duration-300",
        user.contact_status === "blocked" 
            ? "bg-destructive/5 border-destructive/10 grayscale-[0.5]" 
            : "bg-muted/30 border-border hover:bg-muted/50"
    )}>
      <div className="flex items-center gap-4">
        <Link to={`/contacts/profile/${user.id}`} className="flex items-center gap-4 flex-1 min-w-0">
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border relative",
            user.contact_status === "blocked" ? "bg-destructive/10 border-destructive/10" : "bg-primary/10 border-primary/5"
          )}>
            {user.profile_picture ? (
              <img src={user.profile_picture} alt={user.full_name} className="h-full w-full object-cover" />
            ) : (
              <User size={24} className={user.contact_status === "blocked" ? "text-destructive/40" : "text-primary"} />
            )}
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center z-10">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={cn(
                "text-sm font-bold truncate",
                user.contact_status === "blocked" && "text-destructive/70"
              )}>{user.nickname || user.full_name}</h4>
              {user.contact_status === "accepted" && (
                <div className="h-4 w-4 rounded-full bg-green-500/10 flex items-center justify-center">
                  <UserCheck size={10} className="text-green-500" />
                </div>
              )}
              {user.contact_status === "blocked" && (
                <span className="text-[8px] font-black uppercase tracking-tighter bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Blocked</span>
              )}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground truncate">
              @{user.username}
              {isOnline && <span className="ml-2 text-[8px] font-black uppercase text-green-500 bg-green-500/5 px-1 rounded">Online</span>}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {user.contact_status !== "blocked" && (
            <>
              {!user.is_contact && user.contact_status !== "incoming" && user.contact_status !== "pending" && (
                <Button 
                  compact 
                  variant="outline" 
                  className="h-8 px-3 rounded-lg text-[10px] font-bold"
                  onClick={() => handleAction("add")}
                  isLoading={loading}
                >
                  <UserPlus size={14} className="mr-1.5" />
                  Connect
                </Button>
              )}

              {user.contact_status === "incoming" && !isAccepting && (
                <div className="flex gap-1.5">
                   <Button 
                    compact 
                    variant="primary" 
                    className="h-8 px-3 rounded-lg text-[10px] font-bold"
                    onClick={() => setIsAccepting(true)}
                  >
                    Accept
                  </Button>
                  <Button 
                    compact 
                    variant="outline" 
                    className="h-8 px-3 rounded-lg text-[10px] font-bold text-destructive hover:text-destructive"
                    onClick={() => handleAction("decline")}
                    isLoading={loading}
                  >
                    Decline
                  </Button>
                </div>
              )}

              {user.contact_status === "pending" && user.is_contact && (
                 <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                   Request Sent
                 </span>
              )}

              {user.contact_status === "accepted" && (
                <Button 
                  compact 
                  variant="primary" 
                  className="h-8 px-3 rounded-lg text-[10px] font-bold"
                  onClick={handleStartChat}
                  isLoading={chatStarting}
                >
                  <MessageCircle size={14} className="mr-1.5" />
                  Message
                </Button>
              )}

              {user.contact_status === "accepted" && (
                 <Button 
                  compact 
                  variant="outline" 
                  className="h-8 px-3 rounded-lg text-[10px] font-bold text-destructive hover:bg-destructive/5 border-destructive/20"
                  onClick={() => handleAction("remove")}
                  isLoading={loading}
                >
                  Remove
                </Button>
              )}
            </>
          )}

          {user.contact_status === "blocked" ? (
             <Button 
                compact 
                variant="outline" 
                className="h-8 px-3 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 border-primary/20"
                onClick={() => handleAction("unblock")}
                isLoading={loading}
              >
                Unblock
              </Button>
          ) : (
            <button 
                onClick={() => handleAction("block")}
                className="p-2 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 transition-all"
                title="Block User"
            >
                <ShieldAlert size={16} />
            </button>
          )}
        </div>
      </div>

      {isAccepting && (
        <div className="mt-2 pt-2 border-t border-border/30 animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="flex items-center gap-2">
              <input 
                type="text"
                placeholder="Optional nickname for this contact..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="flex-1 h-9 rounded-xl bg-background border border-border px-3 text-[11px] font-medium outline-none focus:border-primary transition-all"
              />
              <Button 
                compact 
                variant="primary" 
                className="h-9 px-4 rounded-xl text-[10px]"
                onClick={() => handleAction("accept", nickname)}
                isLoading={loading}
              >
                Confirm Accept
              </Button>
              <Button 
                compact 
                variant="ghost" 
                className="h-9 px-2 rounded-xl text-[10px]"
                onClick={() => setIsAccepting(false)}
              >
                Cancel
              </Button>
           </div>
        </div>
      )}
    </div>
  );
}
