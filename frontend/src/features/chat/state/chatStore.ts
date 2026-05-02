import { create } from "zustand";
import { socket } from "@/shared/api/socket";
import { httpClient } from "@/shared/http/client";
import { useAuthStore } from "@/modules/auth/state/authState";

interface Room {
  id: string;
  name: string;
  type: "DIRECT" | "GROUP";
  avatar: string | null;
  display_name: string;
  display_avatar: string | null;
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
    sender_name: string;
  } | null;
  unread_count: number;
}

interface Message {
  id: string;
  temp_id?: string;
  sender_id: string;
  room_id: string;
  content: string;
  sequence_id?: number;
  sent_at: number;
  status: "sending" | "sent" | "delivered" | "read";
}

interface ChatState {
  activeRoomId: string | null;
  rooms: Record<string, Room & { 
    messageIds: string[]; 
    typingUsers: Set<string>;
    lastReadSeq: number;
  }>;
  messages: Record<string, Message>;
  isLoading: boolean;
  
  // Actions
  fetchRooms: () => Promise<void>;
  fetchHistory: (roomId: string) => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: Message["status"]) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  sendMessage: (roomId: string, content: string) => void;
  markAsRead: (roomId: string, sequenceId: number) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeRoomId: null,
  rooms: {},
  messages: {},
  isLoading: false,

  fetchRooms: async () => {
    set({ isLoading: true });
    try {
      // Use standard httpClient which has auth interceptors
      const { data } = await httpClient.get("/chat/v1/rooms/");
      const roomMap: Record<string, any> = {};
      data.results.forEach((room: Room) => {
        roomMap[room.id] = {
          ...room,
          messageIds: get().rooms[room.id]?.messageIds || [],
          typingUsers: get().rooms[room.id]?.typingUsers || new Set(),
          lastReadSeq: get().rooms[room.id]?.lastReadSeq || 0,
        };
      });
      set({ rooms: roomMap });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchHistory: async (roomId) => {
    try {
      const { data } = await httpClient.get(`/chat/v1/rooms/${roomId}/history/`);
      const newMessages: Record<string, Message> = {};
      const messageIds: string[] = [];

      // DRF might return .results if paginated
      const results = data.results || data;

      results.forEach((msg: any) => {
        const message: Message = {
          id: msg.id,
          sender_id: msg.sender.id,
          room_id: roomId,
          content: msg.content,
          sequence_id: msg.sequence_id,
          sent_at: new Date(msg.created_at).getTime(),
          status: "read"
        };
        newMessages[msg.id] = message;
        messageIds.push(msg.id);
      });

      set((state) => ({
        messages: { ...state.messages, ...newMessages },
        rooms: {
          ...state.rooms,
          [roomId]: { ...state.rooms[roomId], messageIds: messageIds.reverse() }
        }
      }));
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  },

  setActiveRoom: (roomId) => {
    set({ activeRoomId: roomId });
    if (roomId) {
      get().fetchHistory(roomId);
    }
  },

  addMessage: (message) => set((state) => {
    const roomId = message.room_id;
    const room = state.rooms[roomId] || { 
      id: roomId, 
      name: "Chat", 
      type: "DIRECT",
      messageIds: [], 
      unread_count: 0, 
      typingUsers: new Set(), 
      lastReadSeq: 0 
    };
    
    const existingMsg = Object.values(state.messages).find(m => 
      m.id === message.id || (message.temp_id && m.temp_id === message.temp_id)
    );
    if (existingMsg && existingMsg.status !== "sending") return state;

    return {
      messages: { ...state.messages, [message.id]: message },
      rooms: {
        ...state.rooms,
        [roomId]: {
          ...room,
          messageIds: room.messageIds.includes(message.id) ? room.messageIds : [...room.messageIds, message.id],
          unread_count: state.activeRoomId === roomId ? 0 : (room.unread_count || 0) + 1,
          last_message: { 
            content: message.content, 
            created_at: new Date(message.sent_at).toISOString(),
            sender_id: message.sender_id,
            sender_name: message.sender_id === useAuthStore.getState().user?.id ? "You" : (state.rooms[roomId]?.name || "User")
          }
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
    const room = state.rooms[roomId];
    if (!room) return state;

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
    const user = useAuthStore.getState().user;
    const tempId = `temp-${Date.now()}`;
    const message: Message = {
      id: tempId,
      temp_id: tempId,
      sender_id: user?.id || "me",
      room_id: roomId,
      content,
      sent_at: Date.now(),
      status: "sending"
    };

    get().addMessage(message);

    socket.send("chat_message", {
      target: roomId,
      payload: {
        content,
        temp_id: tempId
      }
    });
  },

  markAsRead: (roomId, sequenceId) => {
    socket.send("read_receipt", {
      target: roomId,
      payload: {
        sequence_id: sequenceId
      }
    });
  }
}));

// --- Global Socket Listeners ---

socket.on("message_ack", (data) => {
  const { temp_id, sequence_id, success } = data;
  if (!success) return;

  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    const tempMsg = updatedMessages[temp_id];
    if (tempMsg) {
      tempMsg.status = "sent";
      tempMsg.sequence_id = sequence_id;
    }
    return { messages: updatedMessages };
  });
});

socket.on("chat_delivery", (data) => {
  const { room_id, sender_id, content, timestamp, sequence_id, message_id, temp_id } = data;
  
  useChatStore.getState().addMessage({
    id: message_id,
    temp_id: temp_id,
    sender_id,
    room_id,
    content,
    sequence_id,
    sent_at: new Date(timestamp).getTime(),
    status: "delivered"
  });
});

socket.on("chat_status", (data) => {
  const { room_id, last_read_seq } = data;
  
  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    Object.values(updatedMessages).forEach(msg => {
      if (msg.room_id === room_id && msg.sequence_id && msg.sequence_id <= last_read_seq) {
        msg.status = "read";
      }
    });
    return { messages: updatedMessages };
  });
});
