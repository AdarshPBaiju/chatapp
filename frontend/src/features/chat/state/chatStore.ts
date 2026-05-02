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
  status: "sending" | "sent" | "delivered" | "read" | "failed";
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

const pendingAckTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearPendingAck(tempId?: string) {
  if (!tempId) return;
  const timer = pendingAckTimers.get(tempId);
  if (timer) {
    clearTimeout(timer);
    pendingAckTimers.delete(tempId);
  }
}

function schedulePendingAck(tempId: string) {
  clearPendingAck(tempId);
  pendingAckTimers.set(
    tempId,
    setTimeout(() => {
      pendingAckTimers.delete(tempId);
      useChatStore.getState().updateMessageStatus(tempId, "failed");
    }, 15000)
  );
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
    const currentUserId = useAuthStore.getState().user?.id;
    const room = state.rooms[roomId] || { 
      id: roomId, 
      name: "Chat", 
      type: "DIRECT",
      avatar: null,
      display_name: "Chat",
      display_avatar: null,
      last_message: null,
      messageIds: [], 
      unread_count: 0, 
      typingUsers: new Set(), 
      lastReadSeq: 0 
    };
    
    // 1. Check if we already have this specific message ID
    // 2. Check if a temporary message was already upgraded to this ID
    const existingMsg = state.messages[message.id] || Object.values(state.messages).find(m => 
      message.temp_id && m.temp_id === message.temp_id
    );
    
    if (existingMsg && existingMsg.id === message.id && existingMsg.status === "read") {
      return state;
    }

    const mergedMessage: Message = existingMsg
      ? {
          ...existingMsg,
          ...message,
          id: message.id,
          temp_id: message.temp_id ?? existingMsg.temp_id,
          status: message.status === "sent" && existingMsg.status === "delivered"
            ? "delivered"
            : message.status === "sent" && existingMsg.status === "read"
              ? "read"
              : message.status,
        }
      : message;

    const updatedMessages = { ...state.messages, [message.id]: mergedMessage };
    
    // Remove temp message if it was different from the final ID to prevent duplicates
    if (message.temp_id && message.temp_id !== message.id) {
      delete updatedMessages[message.temp_id];
    }

    const nextMessageIds = room.messageIds.filter((id) => id !== message.temp_id);
    if (!nextMessageIds.includes(message.id)) {
      nextMessageIds.push(message.id);
    }

    const shouldIncrementUnread =
      state.activeRoomId !== roomId && mergedMessage.sender_id !== currentUserId;

    return {
      messages: updatedMessages,
      rooms: {
        ...state.rooms,
        [roomId]: {
          ...room,
          messageIds: nextMessageIds,
          unread_count: state.activeRoomId === roomId ? 0 : shouldIncrementUnread ? (room.unread_count || 0) + 1 : (room.unread_count || 0),
          last_message: { 
            content: mergedMessage.content, 
            created_at: new Date(mergedMessage.sent_at).toISOString(),
            sender_id: mergedMessage.sender_id,
            sender_name: mergedMessage.sender_id === currentUserId ? "You" : (state.rooms[roomId]?.name || "User")
          }
        }
      }
    };
  }),

  updateMessageStatus: (messageId, status) => set((state) => {
    const existing = state.messages[messageId];
    if (!existing) return state;

    return {
      messages: {
        ...state.messages,
        [messageId]: { ...existing, status }
      }
    };
  }),

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
    const trimmedContent = content.trim();
    if (!roomId || !trimmedContent || !user?.id) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const message: Message = {
      id: tempId,
      temp_id: tempId,
      sender_id: user.id,
      room_id: roomId,
      content: trimmedContent,
      sent_at: Date.now(),
      status: "sending"
    };

    get().addMessage(message);

    if (!socket.isConnected) {
      get().updateMessageStatus(tempId, "failed");
      return;
    }

    socket.send("chat_message", {
      target: roomId,
      payload: {
        content: trimmedContent,
        temp_id: tempId
      }
    });

    schedulePendingAck(tempId);
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

socket.on("status", (data) => {
  if (data.connected) {
    // Re-sync rooms on reconnection to catch missed messages
    useChatStore.getState().fetchRooms();
    return;
  }

  pendingAckTimers.forEach((timer, tempId) => {
    clearTimeout(timer);
    pendingAckTimers.delete(tempId);
    useChatStore.getState().updateMessageStatus(tempId, "failed");
  });
});

socket.on("message_ack", (data) => {
  const { temp_id, sequence_id, success } = data;
  clearPendingAck(temp_id);
  
  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    const tempMsg = updatedMessages[temp_id];
    if (tempMsg) {
      if (success) {
        tempMsg.status = "sent";
        tempMsg.sequence_id = sequence_id;
      } else {
        tempMsg.status = "failed";
      }
    }
    return { messages: updatedMessages };
  });
});

socket.on("chat_delivery", (data) => {
  const { room_id, sender_id, content, timestamp, sequence_id, message_id, temp_id, status } = data;
  clearPendingAck(temp_id);
  
  useChatStore.getState().addMessage({
    id: message_id,
    temp_id: temp_id,
    sender_id,
    room_id,
    content,
    sequence_id,
    sent_at: new Date(timestamp).getTime(),
    status: status === "sent" ? "sent" : "delivered"
  });
});

socket.on("chat_status", (data) => {
  const { room_id, last_read_seq, client_id } = data;
  const currentUserId = useAuthStore.getState().user?.id;
  
  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    Object.values(updatedMessages).forEach(msg => {
      if (
        msg.room_id === room_id &&
        msg.sequence_id &&
        msg.sequence_id <= last_read_seq &&
        msg.sender_id === currentUserId &&
        msg.sender_id !== client_id
      ) {
        msg.status = "read";
      }
    });
    return { messages: updatedMessages };
  });
});
