import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Search, MoreVertical, Send, Phone, Video, Info, Paperclip, Smile, MessageCircle, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { socket } from "@/shared/api/socket";

import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "@/modules/auth/state/authState";

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { roomId: urlRoomId } = useParams<{ roomId: string }>();
  const {
    activeRoomId,
    setActiveRoom,
    messages: allMessages,
    rooms,
    sendMessage,
    markAsRead,
    fetchRooms,
    isLoading,
    loadMoreMessages,
    pendingUser,
    setPendingUser,
    onlineUsers
  } = useChatStore();
  const currentUser = useAuthStore(state => state.user);
  const currentUserId = currentUser?.id;

  const [input, setInput] = useState("");
  const isConnected = socket.isConnected;
  const feedRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readObserver = useRef<IntersectionObserver | null>(null);
  const loadMoreObserver = useRef<IntersectionObserver | null>(null);

  // Manage Socket Connection
  useEffect(() => {
    socket.connect();
  }, []);

  useEffect(() => {
    // Initial fetch
    void fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    // Refetch when returning to the list view from a room
    if (!urlRoomId) {
      void fetchRooms();
    }
  }, [urlRoomId, fetchRooms]);

  // Sync URL with Store activeRoomId (Internal -> External)
  // Handles lazy room creation navigation
  useEffect(() => {
    if (activeRoomId && activeRoomId !== urlRoomId) {
      navigate(`/chats/${activeRoomId}`, { replace: true });
    }
  }, [activeRoomId, urlRoomId, navigate]);

  // Sync URL roomId with Store activeRoomId (External -> Internal)
  // Handles manual navigation and back button
  useEffect(() => {
    if (urlRoomId && urlRoomId !== activeRoomId) {
      setActiveRoom(urlRoomId);
    } else if (!urlRoomId && (activeRoomId || pendingUser)) {
      // Handles returning to the main list / clearing pending chats
      setActiveRoom(null);
      setPendingUser(null);
    }
  }, [urlRoomId, activeRoomId, pendingUser, setActiveRoom, setPendingUser]);

  // Handle room opening from navigation state (intent)
  useEffect(() => {
    const state = (location as any).state;
    const openRoomId = state?.openRoomId;
    const targetUser = state?.targetUser;

    if (openRoomId) {
      navigate(`/chats/${openRoomId}`, { replace: true });
    } else if (targetUser) {
      setPendingUser(targetUser);
      // We don't navigate to a specific ID yet, staying on /chats
      window.history.replaceState({}, document.title);
    }
  }, [location.state, navigate, setPendingUser]);

  const chatList = Object.values(rooms).sort((a, b) => {
    const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
    const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const maxSeqRef = useRef<number>(0);
  const batchTimerRef = useRef<number | null>(null);

  // Setup Viewport Observer for Read Receipts
  useEffect(() => {
    maxSeqRef.current = 0; // Reset on room change

    readObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const seqId = entry.target.getAttribute("data-seq");
            const isMine = entry.target.getAttribute("data-mine") === "true";
            const status = entry.target.getAttribute("data-status");

            if (seqId && !isMine && status !== "read") {
              const seq = parseInt(seqId);
              if (seq > maxSeqRef.current) {
                maxSeqRef.current = seq;

                // Start a timer to batch the read receipt
                if (!batchTimerRef.current && activeRoomId) {
                  batchTimerRef.current = setTimeout(() => {
                    if (activeRoomId && maxSeqRef.current > 0) {
                      markAsRead(activeRoomId, maxSeqRef.current);
                    }
                    batchTimerRef.current = null;
                  }, 1000); // Send at most once per second
                }
              }
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      readObserver.current?.disconnect();
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [activeRoomId, markAsRead]);

  // Infinite Scroll Observer (Top Sentinel)
  useEffect(() => {
    if (loadMoreObserver.current) loadMoreObserver.current.disconnect();

    loadMoreObserver.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && activeRoomId) {
          loadMoreMessages(activeRoomId);
        }
      },
      { threshold: 0.1 }
    );

    if (topSentinelRef.current) {
      loadMoreObserver.current.observe(topSentinelRef.current);
    }

    return () => loadMoreObserver.current?.disconnect();
  }, [activeRoomId, loadMoreMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [allMessages, activeRoomId]);

  // Typing Indicator Emission
  useEffect(() => {
    if (!activeRoomId || !isConnected) return;

    const sendTyping = (isTyping: boolean) => {
      socket.send("typing", {
        target: activeRoomId,
        payload: { is_typing: isTyping }
      });
    };

    if (input.trim().length > 0) {
      sendTyping(true);
      const timeout = setTimeout(() => {
        sendTyping(false);
      }, 3000);
      return () => clearTimeout(timeout);
    } else {
      sendTyping(false);
    }
  }, [input, activeRoomId, isConnected]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || (!activeRoomId && !pendingUser)) return;

    sendMessage(activeRoomId, content);

    // Clear input
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, activeRoomId, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentChat = activeRoomId ? rooms[activeRoomId] : (pendingUser ? {
    id: null,
    display_name: pendingUser.nickname || pendingUser.full_name,
    display_avatar: pendingUser.profile_picture,
    type: "DIRECT",
    isFetchingMore: false,
    messageIds: rooms[""]?.messageIds || [],
    typingUsers: new Set<string>(),
    participants: pendingUser ? [{
      id: pendingUser.id,
      user_id: pendingUser.user_id,
      username: pendingUser.username,
      full_name: pendingUser.full_name,
      profile_picture: pendingUser.profile_picture
    }] : []
  } : null);
  const roomMessages = activeRoomId ? (rooms[activeRoomId]?.messageIds || []) : (pendingUser ? (rooms[""]?.messageIds || []) : []);
  const messages = roomMessages.map(id => allMessages[id]).filter(Boolean);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (!isConnected || !currentUserId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground font-medium animate-pulse">Connecting to chat server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">

      {/* 1. Conversations Sidebar */}
      <aside className={cn(
        "w-full lg:w-[350px] border-r border-border flex flex-col bg-card/10 backdrop-blur-sm transition-all",
        (activeRoomId || pendingUser) && "hidden lg:flex"
      )}>
        {/* Sidebar Header */}
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
            <div className="flex items-center gap-2">
              {/* Live connection indicator */}
              <div className={cn(
                "h-2 w-2 rounded-full transition-colors duration-500",
                isConnected ? "bg-green-500" : "bg-red-400 animate-pulse"
              )} title={isConnected ? "Connected" : "Connecting..."} />
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors">
                <MoreVertical size={16} className="text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" size={16} />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full bg-muted/50 border-transparent focus:border-primary/20 focus:bg-background h-10 pl-10 pr-4 rounded-xl text-sm transition-all outline-none border"
            />
          </div>
        </div>

        {/* Chat List */}
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
              onClick={() => navigate(`/chats/${chat.id}`)}
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
                {chat.type === "DIRECT" && (
                  (() => {
                    const otherUser = chat.participants?.find((p: any) => p.user_id !== currentUserId);
                    if (otherUser?.user_id && onlineUsers.has(otherUser.user_id)) {
                      return (
                        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                        </div>
                      );
                    }
                    return null;
                  })()
                )}
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
                      {chat.last_message.sender_id === useAuthStore.getState().user?.id ? (
                        <span className="font-bold mr-1">You:</span>
                      ) : (
                        chat.type === "GROUP" && (
                          <span className="font-bold mr-1">{chat.last_message.sender_name}:</span>
                        )
                      )}
                      {chat.last_message.content}
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

      {/* 2. Main Chat Room Area */}
      <main className={cn(
        "flex-1 flex flex-col bg-background relative",
        !activeRoomId && !pendingUser && "hidden lg:flex"
      )}>
        <AnimatePresence mode="wait">
          {activeRoomId || pendingUser ? (
            <motion.div
              key={activeRoomId || "pending"}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full w-full"
            >
              {/* Chat Header */}
              <header className="h-[72px] border-b border-border px-6 flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setPendingUser(null);
                      setActiveRoom(null);
                      navigate("/chats");
                    }}
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
                    ) : (() => {
                      const otherUser = currentChat?.participants?.find((p: any) => p.user_id !== currentUserId);
                      const isOnline = otherUser?.user_id ? onlineUsers.has(otherUser.user_id) : false;
                      const lastSeenTime = otherUser?.user_id ? useChatStore.getState().lastSeen[otherUser.user_id] : null;
                      
                      return (
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
                      );
                    })()}
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

              <div ref={feedRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar scroll-smooth">
                {/* Infinite Scroll Sentinel */}
                <div ref={topSentinelRef} className="h-1 w-full" />

                {currentChat?.isFetchingMore && (
                  <div className="flex justify-center py-2">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {messages.length === 0 && (
                  <div className="flex justify-center my-4">
                    <span className="px-4 py-1.5 rounded-full bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Start the conversation
                    </span>
                  </div>
                )}

                {messages.map((msg) => {
                  const currentUser = useAuthStore.getState().user;
                  const isMine = msg.sender_id === currentUser?.id;
                  return (
                    <motion.div
                      key={msg.id}
                      data-seq={msg.sequence_id}
                      data-mine={isMine}
                      data-status={msg.status}
                      ref={(el) => {
                        if (el) readObserver.current?.observe(el);
                      }}
                      initial={{ opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={cn("flex flex-col gap-1 max-w-[80%]", isMine && "ml-auto items-end")}
                    >
                      <div className={cn(
                        "p-4 rounded-2xl text-sm shadow-sm",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm shadow-lg shadow-primary/20"
                          : "bg-muted rounded-tl-sm"
                      )}>
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1 px-1">
                        <span className="text-[9px] text-muted-foreground">{formatTime(msg.sent_at)}</span>
                        {isMine && (
                          <div className="flex items-center ml-1">
                            <div className="flex items-center ml-1">
                              {msg.status === "sending" ? (
                                <span className="text-[9px] text-muted-foreground/50 italic animate-pulse">sending...</span>
                              ) : msg.status === "acknowledged" ? (
                                <span className="text-[11px] text-muted-foreground/40 leading-none">✓</span>
                              ) : msg.status === "failed" ? (
                                <span className="text-[9px] text-destructive font-bold">failed</span>
                              ) : (
                                <div className={cn(
                                  "flex items-center transition-colors duration-300",
                                  msg.status === "read" ? "text-blue-400" : "text-primary/80"
                                )}>
                                  <span className={cn(
                                    "text-[11px] leading-none",
                                    msg.status === "sent" ? "font-normal" : "font-bold"
                                  )}>✓</span>
                                  {(msg.status === "delivered" || msg.status === "read") && (
                                    <span className="text-[11px] leading-none -ml-1 font-bold">✓</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Message Input */}
              <footer className="p-4 bg-background border-t border-border/50">
                <div className="relative flex items-end gap-3 bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-background p-2 rounded-2xl transition-all duration-300">
                  <button className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted flex items-center justify-center transition-colors">
                    <Paperclip size={20} className="text-muted-foreground" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${currentChat?.display_name || "..."}`}
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none resize-none py-2.5 text-sm max-h-32 custom-scrollbar"
                  />
                  <button className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted flex items-center justify-center transition-colors">
                    <Smile size={20} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || !isConnected}
                    className={cn(
                      "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95",
                      input.trim() && isConnected
                        ? "bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <Send size={18} />
                  </button>
                </div>
                {!isConnected && (
                  <p className="text-[10px] text-center text-amber-500 font-medium mt-2 animate-pulse">
                    Connecting to real-time network...
                  </p>
                )}
              </footer>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
                <MessageCircle className="text-primary/20" size={40} />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">Select a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Pick a chat from the left or start a new one to begin messaging in real-time.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
