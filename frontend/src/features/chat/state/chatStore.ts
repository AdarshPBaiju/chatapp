import { create } from "zustand";
import { socket } from "@/shared/api/socket";

interface Message {
  id: string;
  sender_id: string;
  room_id: string;
  content: string;
  sent_at: number;
  status: "sending" | "sent" | "delivered" | "read";
}

interface ChatState {
  activeRoomId: string | null;
  rooms: Record<string, {
    messageIds: string[];
    unreadCount: number;
    typingUsers: Set<string>;
  }>;
  messages: Record<string, Message>;
  
  // Actions
  setActiveRoom: (roomId: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: Message["status"]) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  sendMessage: (roomId: string, content: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeRoomId: null,
  rooms: {},
  messages: {},

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  addMessage: (message) => set((state) => {
    const room = state.rooms[message.room_id] || { messageIds: [], unreadCount: 0, typingUsers: new Set() };
    
    // Prevent duplicates
    if (state.messages[message.id]) return state;

    return {
      messages: { ...state.messages, [message.id]: message },
      rooms: {
        ...state.rooms,
        [message.room_id]: {
          ...room,
          messageIds: [...room.messageIds, message.id],
          unreadCount: state.activeRoomId === message.room_id ? 0 : room.unreadCount + 1
        }
      }
    };
  }),

  updateMessageStatus: (messageId, status) => set((state) => ({
    messages: {
      ...state.messages,
      [messageId]: { ...state.messages[messageId], status }
    }
  })),

  setTyping: (roomId, userId, isTyping) => set((state) => {
    const room = state.rooms[roomId] || { messageIds: [], unreadCount: 0, typingUsers: new Set() };
    const newTyping = new Set(room.typingUsers);
    if (isTyping) newTyping.add(userId);
    else newTyping.delete(userId);

    return {
      rooms: {
        ...state.rooms,
        [roomId]: { ...room, typingUsers: newTyping }
      }
    };
  }),

  sendMessage: (roomId, content) => {
    const tempId = `temp-${Date.now()}`;
    const message: Message = {
      id: tempId,
      sender_id: "me", // Will be replaced by actual user ID
      room_id: roomId,
      content,
      sent_at: Date.now(),
      status: "sending"
    };

    get().addMessage(message);

    // Send via socket
    socket.send("chat_message", {
      id: tempId,
      room_id: roomId,
      content,
    });
  }
}));

// Global Socket Listeners for Chat
socket.on("chat_message", (data) => {
  useChatStore.getState().addMessage(data);
});

socket.on("typing_event", (data) => {
  useChatStore.getState().setTyping(data.room_id, data.user_id, data.is_typing);
});

socket.on("message_ack", (data) => {
  // Update temp message ID to real ID and status to 'sent'
  // Simplified for now: just update status
  useChatStore.getState().updateMessageStatus(data.original_id, "sent");
});
