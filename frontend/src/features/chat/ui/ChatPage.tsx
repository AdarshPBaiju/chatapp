import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MoreVertical, Send, Phone, Video, Info, Paperclip, Smile, MessageCircle, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { socket } from "@/shared/api/socket";

// Mock data for UI development (contacts/rooms will come from API in Phase 2.3)
const MOCK_CHATS = [
  { id: "room-1", name: "Sarah Miller", lastMsg: "See you at 8?", time: "12:45 PM", unread: 2, online: true },
  { id: "room-2", name: "Design Team", lastMsg: "The new icons are ready", time: "11:20 AM", unread: 0, online: false },
  { id: "room-3", name: "David Chen", lastMsg: "Did you check the file?", time: "Yesterday", unread: 0, online: true },
];

interface LocalMessage {
  id: string;
  content: string;
  isMine: boolean;
  timestamp: number;
  status: "sending" | "sent";
}

export function ChatPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Record<string, LocalMessage[]>>({});
  const [isConnected, setIsConnected] = useState(() => socket.isConnected);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track socket connection status
  useEffect(() => {
    const handleStatus = (s: { connected: boolean }) => setIsConnected(s.connected);
    socket.on("status", handleStatus);

    // Listen for incoming messages
    const handleMessage = (data: any) => {
      const roomId = data.room_id;
      if (!roomId) return;
      setLocalMessages(prev => ({
        ...prev,
        [roomId]: [
          ...(prev[roomId] || []),
          { id: data.id, content: data.content, isMine: false, timestamp: Date.now(), status: "sent" }
        ]
      }));
    };
    socket.on("chat_message", handleMessage);

    // Listen for ACKs to confirm sent messages
    const handleAck = (data: any) => {
      if (!selectedChat) return;
      setLocalMessages(prev => ({
        ...prev,
        [selectedChat]: (prev[selectedChat] || []).map(m =>
          m.id === data.original_id ? { ...m, status: "sent" } : m
        )
      }));
    };
    socket.on("message_ack", handleAck);

    return () => {
      socket.off("status", handleStatus);
      socket.off("chat_message", handleMessage);
      socket.off("message_ack", handleAck);
    };
  }, [selectedChat]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [localMessages, selectedChat]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !selectedChat) return;

    const tempId = `temp-${Date.now()}`;
    const newMessage: LocalMessage = {
      id: tempId,
      content,
      isMine: true,
      timestamp: Date.now(),
      status: "sending",
    };

    // Optimistic UI update
    setLocalMessages(prev => ({
      ...prev,
      [selectedChat]: [...(prev[selectedChat] || []), newMessage],
    }));

    // Send via WebSocket
    socket.send("chat_message", {
      id: tempId,
      room_id: selectedChat,
      content,
    });

    // Clear input
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, selectedChat]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentChat = MOCK_CHATS.find(c => c.id === selectedChat);
  const messages = selectedChat ? (localMessages[selectedChat] || []) : [];

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">

      {/* 1. Conversations Sidebar */}
      <aside className={cn(
        "w-full lg:w-[350px] border-r border-border flex flex-col bg-card/10 backdrop-blur-sm transition-all",
        selectedChat && "hidden lg:flex"
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
          {MOCK_CHATS.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setSelectedChat(chat.id)}
              className={cn(
                "group flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-200",
                selectedChat === chat.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-muted/50"
              )}
            >
              <div className="relative shrink-0">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden border border-border/10">
                  <span className="font-bold text-lg">{chat.name.charAt(0)}</span>
                </div>
                {chat.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-bold text-sm truncate">{chat.name}</p>
                  <p className={cn("text-[10px]", selectedChat === chat.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {chat.time}
                  </p>
                </div>
                <p className={cn("text-xs truncate", selectedChat === chat.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {chat.lastMsg}
                </p>
              </div>

              {chat.unread > 0 && selectedChat !== chat.id && (
                <div className="h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {chat.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 2. Main Chat Room Area */}
      <main className={cn(
        "flex-1 flex flex-col bg-background relative",
        !selectedChat && "hidden lg:flex"
      )}>
        <AnimatePresence mode="wait">
          {selectedChat ? (
            <motion.div
              key={selectedChat}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full w-full"
            >
              {/* Chat Header */}
              <header className="h-[72px] border-b border-border px-6 flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button onClick={() => setSelectedChat(null)} className="lg:hidden h-9 w-9 rounded-xl bg-muted flex items-center justify-center mr-2">
                    <ArrowLeft size={18} />
                  </button>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold">
                    {currentChat?.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-sm tracking-tight">{currentChat?.name}</p>
                    <p className="text-[10px] text-green-500 font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                      Online
                    </p>
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

              {/* Message Feed */}
              <div ref={feedRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                  <div className="flex justify-center my-4">
                    <span className="px-4 py-1.5 rounded-full bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Start the conversation
                    </span>
                  </div>
                )}

                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={cn("flex flex-col gap-1 max-w-[80%]", msg.isMine && "ml-auto items-end")}
                  >
                    <div className={cn(
                      "p-4 rounded-2xl text-sm shadow-sm",
                      msg.isMine
                        ? "bg-primary text-primary-foreground rounded-br-sm shadow-lg shadow-primary/20"
                        : "bg-muted rounded-tl-sm"
                    )}>
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-1 px-1">
                      <span className="text-[9px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                      {msg.isMine && (
                        <span className={cn(
                          "text-[9px] font-medium transition-colors",
                          msg.status === "sending" ? "text-muted-foreground/50" : "text-primary"
                        )}>
                          {msg.status === "sending" ? "Sending..." : "✓"}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
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
                    placeholder="Type a message..."
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
