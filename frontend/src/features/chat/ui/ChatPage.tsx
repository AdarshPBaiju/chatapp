import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Search, MoreVertical, Send, Phone, Video, Info, Paperclip, Smile, MessageCircle, ArrowLeft, X, File as FileIcon, RotateCcw, Check, Image as ImageIcon, FileText, Music, Play, Download, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { chatSocket } from "@/shared/api/socket";

import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "@/modules/auth/state/authState";

function normalizeUserId(id?: string | null) {
  return id ? id.toLowerCase() : "";
}

function isSameUser(a?: string | null, b?: string | null) {
  return normalizeUserId(a) === normalizeUserId(b);
}

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
    onlineUsers,
    isReady
  } = useChatStore();
  const currentUser = useAuthStore(state => state.user);
  const currentUserId = normalizeUserId(currentUser?.id);

  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isConnected = isReady;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileTypeFilter, setFileTypeFilter] = useState("image/*,video/*");
  const [shouldCompress, setShouldCompress] = useState(true);

  const onFileSelect = (filter: string, compress: boolean) => {
    setFileTypeFilter(filter);
    setShouldCompress(compress);
    setIsMenuOpen(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };
  const feedRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readObserver = useRef<IntersectionObserver | null>(null);
  const loadMoreObserver = useRef<IntersectionObserver | null>(null);

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

  // Internal navigation is only allowed when there is no URL room yet, which
  // happens after lazy direct-message creation confirms the new room.
  useEffect(() => {
    if (!urlRoomId && activeRoomId) {
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
      const room = rooms[activeRoomId];
      const directUserId = normalizeUserId(
        room?.type === "DIRECT"
          ? room.participants?.find((p: any) => !isSameUser(p.user_id, currentUserId))?.user_id
          : null,
      );
      const routeTarget = room?.type === "DIRECT" && directUserId ? directUserId : activeRoomId;

      chatSocket.send("typing", {
        target: routeTarget,
        payload: { room_id: activeRoomId, is_typing: isTyping }
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
  }, [input, activeRoomId, isConnected, rooms, currentUserId]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const handleSend = useCallback(() => {
    const content = input.trim();
    if ((!content && !selectedFile) || (!activeRoomId && !pendingUser)) return;

    sendMessage(activeRoomId, content, selectedFile || undefined);

    // Clear input and file
    setInput("");
    setSelectedFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, selectedFile, activeRoomId, pendingUser, sendMessage]);



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
                    const otherUser = chat.participants?.find((p: any) => !isSameUser(p.user_id, currentUserId));
                    if (otherUser?.user_id && onlineUsers.has(normalizeUserId(otherUser.user_id))) {
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
                      {isSameUser(chat.last_message.sender_id, useAuthStore.getState().user?.id) ? (
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
                      const otherUser = currentChat?.participants?.find((p: any) => !isSameUser(p.user_id, currentUserId));
                      const otherUserId = normalizeUserId(otherUser?.user_id);
                      const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
                      const lastSeenTime = otherUserId ? useChatStore.getState().lastSeen[otherUserId] : null;

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

                {messages.map((msg, index) => {
                  const isMine = isSameUser(msg.sender_id, currentUserId);
                  const prevMsg = index > 0 ? messages[index - 1] : null;

                  // Grouping logic: Apply ONLY if BOTH the current and previous messages are media
                  // Normal text messages always show full metadata
                  const isMediaGrouping = msg.metadata?.attachment && prevMsg?.metadata?.attachment;
                  const isFirstInGroup = !prevMsg ||
                    !isSameUser(prevMsg.sender_id, msg.sender_id) ||
                    (msg.sent_at - prevMsg.sent_at > 120000) ||
                    !isMediaGrouping;

                  return (
                    <motion.div
                      key={msg.id}
                      data-seq={msg.sequence_id}
                      data-mine={isMine}
                      data-status={msg.status}
                      ref={(el) => {
                        if (el) readObserver.current?.observe(el);
                      }}
                      initial={isFirstInGroup ? { opacity: 0, y: 10, scale: 0.97 } : { opacity: 0, x: isMine ? 10 : -10 }}
                      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={cn(
                        "flex flex-col max-w-[85%] lg:max-w-[70%]",
                        isMine ? "ml-auto items-end" : "items-start",
                        isFirstInGroup ? "mt-4" : "mt-1"
                      )}
                    >
                      {/* Optional: Show sender name for group chats if it's the first in a group */}
                      {isFirstInGroup && !isMine && currentChat?.type === "GROUP" && (
                        <span className="text-[10px] font-bold text-muted-foreground ml-3 mb-1 uppercase tracking-wider">
                          {msg.sender_name || "User"}
                        </span>
                      )}

                      <div className={cn(
                        "relative group/msg transition-all duration-200",
                        "rounded-2xl shadow-sm flex flex-col overflow-hidden",
                        isMine
                          ? cn(
                            "bg-primary text-primary-foreground shadow-lg shadow-primary/10",
                            isFirstInGroup ? "rounded-br-sm" : "rounded-r-sm"
                          )
                          : cn(
                            "bg-muted/80 backdrop-blur-sm border border-border/40",
                            isFirstInGroup ? "rounded-tl-sm" : "rounded-l-sm"
                          ),
                        // Edge-to-edge if it's ONLY an image
                        msg.metadata?.attachment?.type === "IMAGE" && !msg.content && "p-0"
                      )}>
                        {msg.metadata?.attachment && (
                          <div className={cn(
                            "relative overflow-hidden",
                            msg.content ? "p-1 pb-0" : "p-0"
                          )}>
                            {msg.metadata.attachment.type === "IMAGE" && (
                              <div
                                onClick={() => setViewingMedia(msg)}
                                className="relative group/img overflow-hidden cursor-pointer"
                              >
                                <img
                                  src={msg.metadata.attachment.local_url || msg.metadata.attachment.thumbnail_url || msg.metadata.attachment.url}
                                  alt="attachment"
                                  className={cn(
                                    "max-h-[400px] w-full object-contain transition-all duration-500 hover:scale-[1.02]",
                                    !msg.metadata.attachment.processed && !msg.metadata.attachment.local_url && "blur-lg grayscale"
                                  )}
                                />
                                {/* Overlay icon for premium feel */}
                                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/20 text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                                  <Maximize2 size={14} />
                                </div>

                                {msg.status === "sending" && msg.metadata.attachment.progress < 100 && !msg.metadata.attachment.isSuccess && (
                                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-[2px] transition-all duration-300">
                                    <div className="relative h-14 w-14 flex items-center justify-center">
                                      {/* WhatsApp Style Circular Progress */}
                                      <svg className="absolute inset-0 h-full w-full -rotate-90 transform">
                                        <circle
                                          cx="28"
                                          cy="28"
                                          r="24"
                                          stroke="currentColor"
                                          strokeWidth="3.5"
                                          fill="transparent"
                                          className="text-white/20"
                                        />
                                        <circle
                                          cx="28"
                                          cy="28"
                                          r="24"
                                          stroke="currentColor"
                                          strokeWidth="3.5"
                                          fill="transparent"
                                          strokeDasharray={151}
                                          strokeDashoffset={151 - (151 * msg.metadata.attachment.progress) / 100}
                                          strokeLinecap="round"
                                          className="text-white transition-all duration-500 ease-out"
                                        />
                                      </svg>

                                      {/* Central Action Circle */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          useChatStore.getState().cancelUpload(msg.id);
                                        }}
                                        className="relative z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all group/cancel"
                                      >
                                        <X size={20} className="group-hover/cancel:scale-110 transition-transform" />
                                      </button>
                                    </div>

                                    {/* Centered Upload Stats */}
                                    <div className="mt-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
                                      <p className="text-[11px] text-white font-bold tracking-wide">
                                        {(() => {
                                          const total = msg.metadata.attachment.size;
                                          const loaded = (total * msg.metadata.attachment.progress) / 100;
                                          const format = (bytes: number) =>
                                            bytes > 1024 * 1024
                                              ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
                                              : `${(bytes / 1024).toFixed(0)} KB`;
                                          return `${format(loaded)} / ${format(total)}`;
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {msg.metadata?.attachment?.isSuccess && (
                                  <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center backdrop-blur-[2px] animate-in fade-in duration-500">
                                    <div className="h-12 w-12 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                                      <Check size={24} strokeWidth={4} />
                                    </div>
                                    <span className="mt-2 text-[10px] font-bold text-white uppercase tracking-widest drop-shadow-md">Success</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {msg.metadata.attachment.type === "VIDEO" && (
                              <div
                                onClick={() => setViewingMedia(msg)}
                                className="relative group/video cursor-pointer bg-black overflow-hidden"
                              >
                                {msg.metadata.attachment.thumbnail_url ? (
                                  <img
                                    src={msg.metadata.attachment.thumbnail_url}
                                    className="max-h-[300px] w-full object-cover opacity-80"
                                  />
                                ) : (
                                  <div className="h-[200px] w-full flex items-center justify-center bg-muted">
                                    <Video size={40} className="text-muted-foreground/20" />
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                    <Play size={28} fill="currentColor" />
                                  </div>
                                </div>
                              </div>
                            )}

                            {(msg.metadata.attachment.type === "DOCUMENT" || msg.metadata.attachment.type === "AUDIO") && (
                              <div className="p-3 bg-muted/30 flex items-center gap-3 group/doc hover:bg-muted/50 transition-colors">
                                <div className={cn(
                                  "h-12 w-12 rounded-xl flex items-center justify-center shadow-sm",
                                  msg.metadata.attachment.type === "AUDIO" ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"
                                )}>
                                  {msg.metadata.attachment.type === "AUDIO" ? <Music size={24} /> : <FileText size={24} />}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <p className="text-sm font-bold truncate">{msg.metadata.attachment.filename}</p>
                                  <p className="text-[11px] text-muted-foreground uppercase font-black tracking-widest mt-0.5">
                                    {(() => {
                                      const bytes = msg.metadata.attachment.size;
                                      return bytes > 1024 * 1024
                                        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
                                        : `${(bytes / 1024).toFixed(0)} KB`;
                                    })()} • {msg.metadata.attachment.type}
                                  </p>
                                </div>
                                <a
                                  href={msg.metadata.attachment.url}
                                  download
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                                >
                                  <Download size={20} />
                                </a>
                              </div>
                            )}

                            {msg.metadata.attachment.type !== "IMAGE" && msg.metadata.attachment.type !== "VIDEO" && msg.metadata.attachment.type !== "DOCUMENT" && msg.metadata.attachment.type !== "AUDIO" && (
                              <div className="p-3 flex items-center gap-3 bg-muted/20">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                  <FileIcon size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">{msg.metadata.attachment.filename}</p>
                                  <p className="text-[9px] opacity-60">{(msg.metadata.attachment.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {msg.content && (
                          <div className={cn(
                            "px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                            msg.metadata?.attachment && "pt-2"
                          )}>
                            {msg.content}
                          </div>
                        )}
                      </div>

                      {/* Metadata Row: Only show if it's the last in a group OR someone is hovering */}
                      <div className={cn(
                        "flex items-center gap-2 mt-1 px-1 transition-opacity duration-200",
                        isFirstInGroup ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"
                      )}>
                        <span className="text-[10px] text-muted-foreground/60 font-medium">{formatTime(msg.sent_at)}</span>
                        {isMine && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            {msg.status === "sending" ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-primary/60 font-bold italic animate-pulse">
                                  {msg.metadata?.attachment ? `uploading ${Math.round(msg.metadata.attachment.progress)}%` : "sending..."}
                                </span>
                              </div>
                            ) : msg.status === "acknowledged" ? (
                              <span className="text-[11px] text-muted-foreground/40 leading-none">✓</span>
                            ) : msg.status === "failed" ? (
                              <div className="flex items-center gap-2 bg-destructive/5 px-2 py-0.5 rounded-full border border-destructive/10">
                                <span className="text-[9px] text-destructive font-black uppercase tracking-wider">FAILED</span>
                                <button
                                  onClick={() => useChatStore.getState().resendMessage(msg.id)}
                                  className="h-4 w-4 text-destructive flex items-center justify-center hover:scale-125 transition-all active:rotate-180"
                                  title="Retry sending"
                                >
                                  <RotateCcw size={10} className="hover:animate-spin" />
                                </button>
                              </div>
                            ) : (
                              <div className={cn(
                                "flex items-center ml-1 transition-colors duration-300",
                                msg.status === "read" ? "text-blue-500" : "text-primary/70"
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
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Message Input */}
              <footer className="p-4 bg-background border-t border-border/50">
                {selectedFile && (
                  <div className="mb-3 flex items-center gap-3 p-2 bg-muted/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20">
                      {selectedFile.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(selectedFile)} className="h-full w-full object-cover" />
                      ) : (
                        <FileIcon size={20} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                    >
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

                      {/* WhatsApp Style Attachment Menu */}
                      <AnimatePresence>
                        {isMenuOpen && (
                          <>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setIsMenuOpen(false)}
                              className="fixed inset-0 z-40"
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
                              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                              exit={{ opacity: 0, scale: 0.8, y: 20, x: -20 }}
                              className="absolute bottom-14 left-0 z-50 bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-3 grid grid-cols-2 gap-2 min-w-[200px]"
                            >
                              <button
                                onClick={() => onFileSelect("image/*,video/*", true)}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group"
                              >
                                <div className="h-12 w-12 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <ImageIcon size={24} />
                                </div>
                                <span className="text-xs font-bold">Gallery</span>
                              </button>

                              <button
                                onClick={() => onFileSelect("*/*", false)}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group"
                              >
                                <div className="h-12 w-12 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <FileText size={24} />
                                </div>
                                <span className="text-xs font-bold">Document</span>
                              </button>

                              <button
                                onClick={() => onFileSelect("audio/*", false)}
                                className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-primary/10 text-primary transition-colors group"
                              >
                                <div className="h-12 w-12 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                  <Music size={24} />
                                </div>
                                <span className="text-xs font-bold">Audio</span>
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <button className="p-2.5 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                      <Smile size={22} />
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept={fileTypeFilter}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) sendMessage(activeRoomId, "", file, !shouldCompress);
                      e.target.value = ""; // Clear for next selection
                    }}
                  />

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${currentChat?.display_name || "..."}`}
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none resize-none py-2.5 text-sm max-h-32 custom-scrollbar"
                  />
                  <button
                    onClick={handleSend}
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
      {/* Full-screen Media Viewer */}
      <AnimatePresence>
        {viewingMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col"
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between text-white bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center gap-4">
                <button onClick={() => setViewingMedia(null)} className="p-2 hover:bg-white/10 rounded-full">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <p className="font-bold">{viewingMedia.sender_name || "Gallery"}</p>
                  <p className="text-xs text-white/60">{new Date(viewingMedia.sent_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewingMedia.metadata.attachment.url}
                  download
                  className="p-2.5 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Download size={22} />
                </a>
                <button onClick={() => setViewingMedia(null)} className="p-2.5 hover:bg-white/10 rounded-full">
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-4">
              {viewingMedia.metadata.attachment.type === "IMAGE" ? (
                <motion.img
                  layoutId={viewingMedia.id}
                  src={viewingMedia.metadata.attachment.url}
                  className="max-h-full max-w-full object-contain shadow-2xl"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                />
              ) : (
                <video
                  src={viewingMedia.metadata.attachment.url}
                  controls
                  autoPlay
                  className="max-h-full max-w-full shadow-2xl"
                />
              )}
            </div>

            {/* Footer / Caption */}
            {viewingMedia.content && (
              <div className="p-8 text-center bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-lg max-w-2xl mx-auto leading-relaxed">
                  {viewingMedia.content}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
