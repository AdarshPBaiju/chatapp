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
  isFetchingMore?: boolean;
}

interface Message {
  id: string;
  temp_id?: string;
  idempotency_key?: string;
  sender_id: string;
  room_id: string;
  content: string;
  sequence_id?: number;
  sent_at: number;
  status: "sending" | "acknowledged" | "sent" | "delivered" | "read" | "failed";
}

type RoomState = Room & {
  messageIds: string[];
  typingUsers: Set<string>;
  lastReadSeq: number;
  lastSyncedSeq: number;
};

interface ChatState {
  activeRoomId: string | null;
  rooms: Record<string, RoomState>;
  messages: Record<string, Message>;
  isLoading: boolean;
  pendingUser: any | null; // Using any for simplicity with ContactUser type
  fetchRooms: () => Promise<void>;
  fetchHistory: (roomId: string) => Promise<void>;
  syncRoom: (roomId: string) => Promise<void>;
  flushOutbox: () => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  addMessage: (message: Message) => void;
  addMessages: (messages: Message[]) => void;
  loadMoreMessages: (roomId: string) => Promise<void>;
  updateMessageStatus: (messageId: string, status: Message["status"]) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  sendMessage: (roomId: string | null, content: string) => Promise<void>;
  markAsRead: (roomId: string, sequenceId: number) => void;
  setPendingUser: (user: any | null) => void;
}

const pendingAckTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getCurrentUserId() {
  return useAuthStore.getState().user?.id ?? null;
}

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
    }, 15000),
  );
}

function createEmptyRoom(roomId: string): RoomState {
  return {
    id: roomId,
    name: "Chat",
    type: "DIRECT",
    avatar: null,
    display_name: "Chat",
    display_avatar: null,
    last_message: null,
    unread_count: 0,
    messageIds: [],
    typingUsers: new Set(),
    lastReadSeq: 0,
    lastSyncedSeq: 0,
  };
}



function mapHistoryMessage(roomId: string, msg: any): Message {
  const currentUserId = getCurrentUserId();
  return {
    id: msg.id,
    sender_id: msg.sender.id,
    room_id: roomId,
    content: msg.content,
    sequence_id: msg.sequence_id,
    sent_at: msg.sent_at || new Date().getTime(),
    status: msg.status || (msg.sender.id === currentUserId ? "sent" : "read"),
  };
}

function sendOutboxEntry(message: Message) {
  if (!socket.isConnected) {
    return;
  }

  socket.send("chat_message", {
    target: message.room_id,
    payload: {
      content: message.content,
      temp_id: message.temp_id,
      idempotency_key: message.idempotency_key,
    },
  });

  schedulePendingAck(message.temp_id!);
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeRoomId: null,
  rooms: {},
  messages: {},
  isLoading: false,
  pendingUser: null,

  fetchRooms: async () => {
    set({ isLoading: true });
    try {
      const { data } = await httpClient.get("/chat/v1/rooms/");
      const results = data.results || data;
      const roomMap: Record<string, RoomState> = {};
      const currentState = get();

      results.forEach((room: Room) => {
        const existing = currentState.rooms[room.id];
        roomMap[room.id] = {
          ...room,
          messageIds: existing?.messageIds || [],
          typingUsers: existing?.typingUsers || new Set(),
          lastReadSeq: existing?.lastReadSeq || 0,
          lastSyncedSeq: existing?.lastSyncedSeq || 0,
        };
      });

      set({ rooms: roomMap });

      const activeRoomId = get().activeRoomId;
      if (activeRoomId && roomMap[activeRoomId]) {
        void get().syncRoom(activeRoomId);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  syncRoom: async (roomId) => {
    try {
      const { data } = await httpClient.get(`/chat/v1/rooms/${roomId}/history/`);
      const results = data.results || data;

      if (!Array.isArray(results) || results.length === 0) {
        return;
      }

      // Force messages to the requested roomId to avoid mismatches
      const normalized = results.map((msg: any) => mapHistoryMessage(roomId, msg));
      normalized.reverse();
      get().addMessages(normalized);
    } catch (error) {
      console.error(`Failed to sync room ${roomId}`, error);
    }
  },

  flushOutbox: async () => {},

  fetchHistory: async (roomId) => {
    const room = get().rooms[roomId];
    if (room?.messageIds.length && !socket.isConnected) {
      return;
    }
    await get().syncRoom(roomId);
  },

  setActiveRoom: (roomId) => {
    set((state) => {
      const updatedRooms = { ...state.rooms };
      if (roomId && updatedRooms[roomId]) {
        updatedRooms[roomId] = { ...updatedRooms[roomId], unread_count: 0 };
      }
      return { activeRoomId: roomId, pendingUser: null, rooms: updatedRooms };
    });
    if (roomId) {
      void get().fetchHistory(roomId);
    }
  },

  setPendingUser: (user) => {
    set({ pendingUser: user, activeRoomId: null });
  },

  addMessages: (messages: Message[]) =>
    set((state) => {
      if (messages.length === 0) return state;

      const currentUserId = getCurrentUserId();
      const updatedMessages = { ...state.messages };
      const updatedRooms = { ...state.rooms };

      const lookupMap = new Map<string, string>();
      Object.values(state.messages).forEach(m => {
        if (m.temp_id) lookupMap.set(m.temp_id, m.id);
        if (m.idempotency_key) lookupMap.set(m.idempotency_key, m.id);
      });

      messages.forEach((message) => {
        const roomId = message.room_id;
        const room = updatedRooms[roomId] || createEmptyRoom(roomId);

        const existingId = lookupMap.get(message.id) ||
          (message.temp_id ? lookupMap.get(message.temp_id) : null) ||
          (message.idempotency_key ? lookupMap.get(message.idempotency_key) : null);

        const existingMsg = existingId ? updatedMessages[existingId] : updatedMessages[message.id];

        const mergedMessage: Message = existingMsg ? {
          ...existingMsg,
          ...message,
          id: message.id,
          status: (message.status === "read" || existingMsg.status === "read") ? "read" :
            (message.status === "delivered" || existingMsg.status === "delivered") ? "delivered" :
              message.status,
        } : message;

        updatedMessages[message.id] = mergedMessage;

        if (message.temp_id && message.temp_id !== message.id) {
          delete updatedMessages[message.temp_id];
          lookupMap.delete(message.temp_id);
        }
        if (existingId && existingId !== message.id) {
          delete updatedMessages[existingId];
        }

        const compareMessages = (idA: string, idB: string) => {
          const mA = updatedMessages[idA];
          const mB = updatedMessages[idB];
          if (!mA || !mB) return 0;

          if (mA.sequence_id && mB.sequence_id) {
            try {
              const sA = BigInt(mA.sequence_id);
              const sB = BigInt(mB.sequence_id);
              if (sA < sB) return -1;
              if (sA > sB) return 1;
            } catch (e) {}
          }

          const tA = mA.sent_at ? new Date(mA.sent_at).getTime() : 0;
          const tB = mB.sent_at ? new Date(mB.sent_at).getTime() : 0;
          if (tA !== tB) return tA - tB;

          if (mA.sequence_id && !mB.sequence_id) return -1;
          if (!mA.sequence_id && mB.sequence_id) return 1;

          return (mA.id || "").localeCompare(mB.id || "");
        };

        let nextMessageIds = Array.from(new Set([...room.messageIds, message.id]))
          .filter(id => (id === message.id) || (id !== message.temp_id && id !== existingId));
        
        nextMessageIds.sort(compareMessages);

        if (nextMessageIds.length > 500) {
          const removed = nextMessageIds.splice(0, nextMessageIds.length - 500);
          removed.forEach(id => {
            if (id !== message.id) delete updatedMessages[id];
          });
        }

        const isNewToRoom = !room.messageIds.includes(message.id);
        const shouldIncrementUnread = state.activeRoomId !== roomId && mergedMessage.sender_id !== currentUserId && isNewToRoom;

        // Only update last_message if this message is newer than current one
        const currentLastAt = room.last_message ? new Date(room.last_message.created_at).getTime() : 0;
        const isLatest = mergedMessage.sent_at >= currentLastAt;

        updatedRooms[roomId] = {
          ...updatedRooms[roomId],
          messageIds: nextMessageIds,
          unread_count: state.activeRoomId === roomId ? 0 :
            shouldIncrementUnread ? (updatedRooms[roomId].unread_count || 0) + 1 : updatedRooms[roomId].unread_count,
          last_message: isLatest ? {
            content: mergedMessage.content,
            created_at: new Date(mergedMessage.sent_at).toISOString(),
            sender_id: mergedMessage.sender_id,
            sender_name: mergedMessage.sender_id === currentUserId ? "You" : room.display_name || "User",
          } : updatedRooms[roomId].last_message,
          lastSyncedSeq: Math.max(updatedRooms[roomId].lastSyncedSeq || 0, mergedMessage.sequence_id || 0),
        };
      });

      return { messages: updatedMessages, rooms: updatedRooms };
    }),

  addMessage: (message) => get().addMessages([message]),

  loadMoreMessages: async (roomId: string) => {
    const { rooms, messages } = get();
    const room = rooms[roomId];
    if (!room || room.messageIds.length === 0 || room.isFetchingMore) return;

    set((state) => ({
      rooms: {
        ...state.rooms,
        [roomId]: { ...state.rooms[roomId], isFetchingMore: true }
      }
    }));

    const oldestMsgId = room.messageIds[0];
    const oldestMsg = messages[oldestMsgId];
    if (!oldestMsg || !oldestMsg.sequence_id) {
      set((state) => ({
        rooms: {
          ...state.rooms,
          [roomId]: { ...state.rooms[roomId], isFetchingMore: false }
        }
      }));
      return;
    }

    try {
      const response = await httpClient.get(`/chat/v1/rooms/${roomId}/history/`, {
        params: { before_seq_id: oldestMsg.sequence_id }
      });
      
      if (response.data && response.data.length > 0) {
        get().addMessages(response.data);
      }
    } catch (error) {
      console.error("❌ Failed to load more messages:", error);
    } finally {
      set((state) => ({
        rooms: {
          ...state.rooms,
          [roomId]: { ...state.rooms[roomId], isFetchingMore: false }
        }
      }));
    }
  },

  updateMessageStatus: (messageId, status) =>
    set((state) => {
      const existing = state.messages[messageId];
      if (!existing) return state;

      return {
        messages: {
          ...state.messages,
          [messageId]: { ...existing, status },
        },
      };
    }),

  setTyping: (roomId, userId, isTyping) =>
    set((state) => {
      const room = state.rooms[roomId];
      if (!room) return state;

      const newTyping = new Set(room.typingUsers);
      if (isTyping) newTyping.add(userId);
      else newTyping.delete(userId);

      return {
        rooms: {
          ...state.rooms,
          [roomId]: { ...room, typingUsers: newTyping },
        },
      };
    }),

  sendMessage: async (roomId, content) => {
    const state = get();
    const user = useAuthStore.getState().user;
    const trimmedContent = content.trim();
    if (!trimmedContent || !user?.id) return;

    let targetRoomId = roomId;

    if (!targetRoomId && state.pendingUser) {
      try {
        const res = await httpClient.post(`/chat/v1/rooms/dm/${state.pendingUser.id}/`);
        const newRoom = res.data;
        targetRoomId = newRoom.id;

        set((state) => ({
          rooms: {
            ...state.rooms,
            [targetRoomId!]: {
              ...newRoom,
              messageIds: [],
              typingUsers: new Set(),
              lastReadSeq: 0,
              lastSyncedSeq: 0,
            }
          },
          activeRoomId: targetRoomId,
          pendingUser: null
        }));
      } catch (error) {
        console.error("❌ Failed to create room lazily:", error);
        return;
      }
    }

    if (!targetRoomId) return;

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: Message = {
      id: tempId,
      temp_id: tempId,
      idempotency_key: tempId,
      sender_id: user.id,
      room_id: targetRoomId,
      content: trimmedContent,
      sent_at: Date.now(),
      status: "sending",
    };

    get().addMessage(message);

    if (!socket.isConnected) {
      console.log("📤 Queuing message for later send");
      return;
    }

    sendOutboxEntry(message);
  },

  markAsRead: (roomId, sequenceId) => {
    socket.send("read_receipt", {
      target: roomId,
      payload: {
        sequence_id: sequenceId,
      },
    });
  },
}));


socket.on("status", (data) => {
  if (data.connected) {
    void useChatStore.getState().fetchRooms();
    // Removed outbox flush
    return;
  }

  console.log("🔌 Socket disconnected");
  // Mark all sending messages as failed
  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    Object.values(updatedMessages).forEach((msg) => {
      if (msg.status === "sending") {
        msg.status = "failed";
      }
    });
    return { messages: updatedMessages };
  });
});

socket.on("message_ack", (data) => {
  const { temp_id, message_id, sequence_id, status, success } = data;
  clearPendingAck(temp_id);

  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    const tempMsg = updatedMessages[temp_id];
    
    if (tempMsg) {
      const finalId = message_id || temp_id;
      
      // Update message content
      const updatedMsg = {
        ...tempMsg,
        id: finalId,
        sequence_id: sequence_id || tempMsg.sequence_id,
        status: success ? (status || "acknowledged") : "failed"
      };

      // If ID changed, swap the key in the map
      if (finalId !== temp_id) {
        delete updatedMessages[temp_id];
      }
      updatedMessages[finalId] = updatedMsg;

      // Also update the room's messageIds list to use the new ID
      const updatedRooms = { ...state.rooms };
      const roomId = tempMsg.room_id;
      if (roomId && updatedRooms[roomId]) {
        updatedRooms[roomId] = {
          ...updatedRooms[roomId],
          messageIds: updatedRooms[roomId].messageIds.map(id => id === temp_id ? finalId : id)
        };
      }

      return { messages: updatedMessages, rooms: updatedRooms };
    }
    
    return state;
  });
});

socket.on("chat_delivery", (data) => {
  const payload = data.payload || data;
  const {
    id,
    room_id,
    sender_id,
    content,
    created_at,
    sequence_id,
    temp_id,
    status,
  } = payload;
  clearPendingAck(temp_id);

  const existing = temp_id ? useChatStore.getState().messages[temp_id] : undefined;
  const idempotencyKey = existing?.idempotency_key ?? temp_id;

  const state = useChatStore.getState();
  const isNewRoom = !state.rooms[room_id];

  state.addMessage({
    id: id,
    temp_id,
    idempotency_key: idempotencyKey,
    sender_id,
    room_id,
    content,
    sequence_id,
    sent_at: created_at ? new Date(created_at).getTime() : Date.now(),
    status: status || "sent",
  });

  // 🚀 SIDEBAR SYNC: If this is a new room, fetch full room metadata to update sidebar
  if (isNewRoom) {
    void state.fetchRooms();
  }
});

socket.on("chat_read", (data) => {
  console.log("📦 Read Event:", data);
  const payload = data.payload || data;
  const { room_id, sequence_id, sender_id } = payload;
  const currentUserId = getCurrentUserId();

  if (sender_id === currentUserId) return; // Ignore our own read events

  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    Object.keys(updatedMessages).forEach((key) => {
      const msg = updatedMessages[key];
      if (
        msg.room_id === room_id &&
        msg.sequence_id &&
        Number(msg.sequence_id) <= Number(sequence_id) &&
        msg.sender_id === currentUserId &&
        msg.status !== "read"
      ) {
        // IMMUTABLE UPDATE: Clone the message object
        updatedMessages[key] = {
          ...msg,
          status: "read"
        };
      }
    });
    return { messages: updatedMessages };
  });
});

socket.on("chat_status", (data) => {
  console.log("🔵 Status Event:", data);
  const payload = data.payload || data;
  const { room_id, last_read_seq, message_id, id, temp_id, status } = payload;
  const currentUserId = getCurrentUserId();

  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    const targetMsgId = message_id || id || temp_id;

    if (targetMsgId) {
      // Find the message key
      const messageKey = Object.keys(updatedMessages).find(key => {
        const m = updatedMessages[key];
        return key === targetMsgId || m.id === targetMsgId || m.temp_id === targetMsgId || m.temp_id === temp_id;
      });

      if (messageKey && status) {
        // Map "sent" from backend to "delivered" in our UI context
        const mappedStatus = status.toLowerCase() === "sent" ? "delivered" : status.toLowerCase();
        
        // IMMUTABLE UPDATE: Clone the message object
        updatedMessages[messageKey] = {
          ...updatedMessages[messageKey],
          status: mappedStatus as any
        };
      }
    }

    // 2. Handle bulk read status update (Collective Read Ticks)
    if (last_read_seq) {
      Object.keys(updatedMessages).forEach((key) => {
        const msg = updatedMessages[key];
        if (
          msg.room_id === room_id &&
          msg.sequence_id &&
          Number(msg.sequence_id) <= Number(last_read_seq) &&
          msg.sender_id === currentUserId &&
          msg.status !== "read"
        ) {
          // IMMUTABLE UPDATE: Clone the message object
          updatedMessages[key] = {
            ...msg,
            status: "read"
          };
        }
      });
    }

    return { messages: updatedMessages };
  });
});
