import { create } from "zustand";
import { chatSocket, presenceSocket } from "@/shared/api/socket";
import { httpClient } from "@/shared/http/client";
import { useAuthStore } from "@/modules/auth/state/authState";
import {
  initMultipartUpload,
  getPartSignedUrl,
  uploadPart,
  completeMultipartUpload,
  requestSignedUrl,
  uploadFileToS3
} from "@/features/chat/api/media";
import { compressImage } from "@/features/chat/lib/mediaUtils";

export interface Room {
  id: string;
  slug?: string; // New field for Ghost Chat
  name: string;
  type: "DIRECT" | "GROUP" | "CHANNEL";
  avatar: string | null;
  display_name: string;
  display_avatar: string | null;
  last_message: {
    id: string;
    content: string;
    created_at: string;
    sender_id: string;
    sender_name: string;
    status: Message["status"];
  } | null;
  unread_count: number;
  participants: { id: string; user_id: string; username: string; full_name: string; profile_picture: string | null }[];
  isFetchingMore?: boolean;
}

export interface Attachment {
  id?: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  metadata?: any;
  is_processed: boolean;
  // Local UI states
  local_url?: string;
  progress?: number;
  isSuccess?: boolean;
}

export interface Message {
  id: string;
  temp_id?: string;
  idempotency_key?: string;
  sender_id: string;
  sender_name?: string;
  room_id: string;
  content: string;
  type: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "SYSTEM";
  sequence_id?: number;
  metadata?: any;
  sent_at: number;
  status: "sending" | "acknowledged" | "sent" | "delivered" | "read" | "failed";

  // Phase 1 Features
  reply_to?: Message | null;
  reply_to_id?: string | null;
  forwarded_from?: any | null;
  is_edited: boolean;
  edited_at?: string | null;
  delivered_at?: string | null;
  seen_at?: string | null;

  // Phase 2 Features
  attachments: Attachment[];
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
  onlineUsers: Set<string>;
  lastSeen: Record<string, number>;
  isReady: boolean;
  fetchRooms: () => Promise<void>;
  fetchHistory: (roomId: string, beforeSeq?: number) => Promise<void>;
  fetchRoomDetail: (roomId: string) => Promise<void>;
  fetchPresence: (userIds: string[]) => Promise<void>;
  getPresence: (userIds: string[]) => void;
  subscribePresence: (userIds: string[]) => void;
  unsubscribePresence: (userIds: string[]) => void;
  syncRoom: (roomId: string) => Promise<void>;
  flushOutbox: () => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  subscribeRoom: (roomId: string) => void;
  sendTypingStatus: (roomId: string, isTyping: boolean) => void;
  loadMoreMessages: (roomId: string) => Promise<void>;
  updateMessageStatus: (tempId: string, status: Message["status"], messageId?: string) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  sendMessage: (roomId: string | null, content: string, file?: File, replyToId?: string, skipCompression?: boolean) => Promise<void>;
  markAsRead: (roomId: string, sequenceId: number) => void;
  setPendingUser: (user: any | null) => void;
  addMessages: (messages: Message[], skipUnread?: boolean) => void;
  addMessage: (message: Message, skipUnread?: boolean) => void;
  cancelUpload: (tempId: string) => void;
  resendMessage: (tempId: string, skipCompression?: boolean) => Promise<void>;
  updateUploadProgress: (tempId: string, progress: number, isSuccess?: boolean) => void;
}

const abortControllers = new Map<string, { abort: () => void }>();
const failedFiles = new Map<string, File>();

const pendingAckTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomHistoryRequests = new Map<string, Promise<void>>();
const roomLastFullSyncAt = new Map<string, number>();
const ROOM_FULL_SYNC_TTL_MS = 10_000;

function normalizeUserId(id?: string | null) {
  return id ? id.toLowerCase() : "";
}

function getCurrentUserId() {
  return useAuthStore.getState().user?.id ?? null;
}

function normalizePeerUserIds(userIds: string[]) {
  const currentUserId = normalizeUserId(getCurrentUserId());
  return Array.from(
    new Set(
      userIds
        .map(normalizeUserId)
        .filter((userId) => userId && userId !== currentUserId),
    ),
  );
}

function getDirectRecipientUserId(room?: Pick<Room, "type" | "participants"> | null) {
  if (!room || room.type !== "DIRECT") return "";

  const currentUserId = normalizeUserId(getCurrentUserId());
  return normalizeUserId(
    room.participants.find((participant) => normalizeUserId(participant.user_id) !== currentUserId)?.user_id,
  );
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
      const state = useChatStore.getState();
      const msg = state.messages[tempId];
      if (msg && msg.status === "sending") {
        console.log(`⏳ Message ${tempId} timed out waiting for ACK`);
        state.updateMessageStatus(tempId, "failed");
      }
    }, 30000),
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
    participants: [],
  };
}



function mapHistoryMessage(roomId: string, msg: any): Message {
  const currentUserId = normalizeUserId(getCurrentUserId());
  const senderId = normalizeUserId(msg.sender_id || msg.sender?.id);
  const sentAt = typeof msg.sent_at === "number"
    ? msg.sent_at
    : msg.sent_at
      ? new Date(msg.sent_at).getTime()
      : Date.now();

  return {
    id: msg.id,
    sender_id: senderId,
    sender_name: msg.sender_name || msg.sender?.full_name || msg.sender?.username,
    room_id: msg.room_id || roomId,
    content: msg.content,
    type: msg.type || "TEXT",
    sequence_id: msg.sequence_id,
    sent_at: Number.isFinite(sentAt) ? sentAt : Date.now(),
    status: (msg.status || (senderId === currentUserId ? "sent" : "read")).toLowerCase() as any,
    metadata: msg.metadata,

    // Phase 1
    reply_to: msg.reply_to ? mapHistoryMessage(roomId, msg.reply_to) : null,
    reply_to_id: msg.reply_to_id,
    forwarded_from: msg.forwarded_from,
    is_edited: msg.is_edited || false,
    edited_at: msg.edited_at,
    delivered_at: msg.delivered_at,
    seen_at: msg.seen_at,

    // Phase 2
    attachments: (msg.attachments || []).map((att: any) => ({
      id: att.id,
      type: att.type,
      storage_key: att.storage_key,
      file_name: att.file_name,
      mime_type: att.mime_type,
      size_bytes: att.size_bytes,
      metadata: att.metadata,
      is_processed: att.is_processed,
    })),
  };
}

function sendOutboxEntry(message: Message, routeTarget: string, targetUserId?: string | null) {
  if (!chatSocket.isConnected) {
    return;
  }

  chatSocket.send("chat_message", {
    target: routeTarget,
    payload: {
      room_id: message.room_id,
      content: message.content,
      temp_id: message.temp_id,
      idempotency_key: message.idempotency_key,
      target_user_id: targetUserId,
    },
  });

  schedulePendingAck(message.temp_id!);
}

// WS-driven room list: fetch once per connection, not on every component mount
let roomsFetchedForSession = false;

export const useChatStore = create<ChatState>((set, get) => ({
  activeRoomId: null,
  rooms: {},
  messages: {},
  isLoading: false,
  pendingUser: null,
  onlineUsers: new Set<string>(),
  lastSeen: {},
  isReady: false,

  fetchRooms: async () => {
    // WS-driven: skip if already fetched for this session
    if (roomsFetchedForSession && Object.keys(get().rooms).length > 0) return;
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

      if (currentState.rooms[""]) {
        roomMap[""] = currentState.rooms[""];
      }

      set((state) => ({
        rooms: {
          ...state.rooms,
          ...roomMap
        }
      }));
      roomsFetchedForSession = true; // mark as fetched for this WS session

      // Fetch presence for all participants in all rooms
      const allUserIds = new Set<string>();
      const currentUserId = normalizeUserId(getCurrentUserId());
      results.forEach((room: Room) => {
        room.participants.forEach(p => {
          const userId = normalizeUserId(p.user_id);
          if (userId && userId !== currentUserId) allUserIds.add(userId);
        });
      });
      get().getPresence(Array.from(allUserIds));

    } finally {
      set({ isLoading: false });
    }
  },

  fetchRoomDetail: async (roomId: string) => {
    if (!roomId) return;
    set({ isLoading: true });
    try {
      const { data } = await httpClient.get(`/chat/v1/rooms/${roomId}/`);
      set((state) => {
        const existing = state.rooms[roomId];
        return {
          rooms: {
            ...state.rooms,
            [roomId]: {
              ...data,
              messageIds: existing?.messageIds || [],
              typingUsers: existing?.typingUsers || new Set(),
              lastReadSeq: existing?.lastReadSeq || 0,
              lastSyncedSeq: existing?.lastSyncedSeq || 0,
            }
          }
        };
      });

      // Fetch presence for new room participants
      const room = get().rooms[roomId];
      if (room) {
        const pids = room.participants.map(p => p.user_id);
        get().subscribePresence(pids);
        get().getPresence(pids);
      }
      // Kick off history fetch now that we have room metadata
      void get().fetchHistory(roomId);
    } catch (error) {
      console.error(`❌ Failed to fetch room detail for ${roomId}:`, error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPresence: async (userIds: string[]) => {
    if (userIds.length === 0) return;
    try {
      const normalized = normalizePeerUserIds(userIds);
      if (normalized.length === 0) return;
      const response = await fetch(`${window.location.origin}/presence?user_ids=${normalized.join(",")}`);
      const statusMap = await response.json();

      set((state) => {
        const newOnlineUsers = new Set(state.onlineUsers);
        Object.entries(statusMap).forEach(([id, status]) => {
          const normalizedId = normalizeUserId(id);
          if (status === "online") newOnlineUsers.add(normalizedId);
          else newOnlineUsers.delete(normalizedId);
        });
        return { onlineUsers: newOnlineUsers };
      });
    } catch (error) {
      console.error("❌ Failed to fetch presence:", error);
    }
  },

  getPresence: (userIds: string[]) => {
    if (userIds.length === 0) return;
    const normalized = normalizePeerUserIds(userIds);
    if (normalized.length === 0) return;
    presenceSocket.send("get_presence", { payload: { user_ids: normalized } });
  },

  subscribePresence: (userIds: string[]) => {
    if (userIds.length === 0) return;
    const normalized = normalizePeerUserIds(userIds);
    if (normalized.length === 0) return;
    presenceSocket.send("subscribe_presence", { payload: { user_ids: normalized } });
  },

  unsubscribePresence: (userIds: string[]) => {
    if (userIds.length === 0) return;
    const normalized = normalizePeerUserIds(userIds);
    if (normalized.length === 0) return;
    presenceSocket.send("unsubscribe_presence", { payload: { user_ids: normalized } });
  },

  syncRoom: async (roomId) => {
    if (!roomId) return;

    const room = get().rooms[roomId];
    const lastSyncAt = roomLastFullSyncAt.get(roomId) || 0;
    if (room?.messageIds.length && Date.now() - lastSyncAt < ROOM_FULL_SYNC_TTL_MS) {
      return;
    }

    const existingRequest = roomHistoryRequests.get(roomId);
    if (existingRequest) {
      await existingRequest;
      return;
    }

    const request = (async () => {
      try {
        const { data } = await httpClient.get(`/chat/v1/rooms/${roomId}/history/`);
        const results = data.results || data;

        if (Array.isArray(results) && results.length > 0) {
          const normalized = results.map((msg: any) => mapHistoryMessage(roomId, msg)).reverse();
          get().addMessages(normalized, true);
        }
        roomLastFullSyncAt.set(roomId, Date.now());
      } catch (error) {
        console.error(`Failed to sync room ${roomId}`, error);
      } finally {
        roomHistoryRequests.delete(roomId);
      }
    })();

    roomHistoryRequests.set(roomId, request);
    await request;
  },

  flushOutbox: async () => { },

  fetchHistory: async (roomId, beforeSeq) => {
    const room = get().rooms[roomId];
    if (room?.messageIds.length && !chatSocket.isConnected && !beforeSeq) {
      return;
    }
    await get().syncRoom(roomId);
  },

  setActiveRoom: (roomId) => {
    const previous = get().activeRoomId;
    if (previous === roomId) return;

    if (previous) {
      const oldRoom = get().rooms[previous];
      if (oldRoom) {
        get().unsubscribePresence(oldRoom.participants.map(p => p.user_id));
      }
    }

    set((state) => {
      const updatedRooms = { ...state.rooms };
      if (roomId && updatedRooms[roomId]) {
        updatedRooms[roomId] = { ...updatedRooms[roomId], unread_count: 0 };
      }
      return { activeRoomId: roomId, pendingUser: null, rooms: updatedRooms };
    });

    if (roomId) {
      get().subscribeRoom(roomId);

      const room = get().rooms[roomId];
      if (!room) {
        // Eagerly set loading BEFORE the async fetch so the UI shows spinner, not "Not Found"
        set({ isLoading: true });
        void get().fetchRoomDetail(roomId);
      } else {
        const pids = room.participants.map(p => p.user_id);
        get().subscribePresence(pids);
        get().getPresence(pids);
        void get().fetchHistory(roomId);
      }
    }
  },

  subscribeRoom: (roomId: string) => {
    if (!roomId) return;
    chatSocket.send("subscribe_room", { payload: { room_id: roomId } });
  },

  sendTypingStatus: (roomId: string, isTyping: boolean) => {
    if (!roomId) return;
    chatSocket.send("typing", {
      payload: {
        room_id: roomId,
        is_typing: isTyping
      }
    });
  },

  setPendingUser: (user) => {
    set({ pendingUser: user, activeRoomId: null });
  },

  addMessages: (messages: Message[], skipUnread = false) =>
    set((state) => {
      if (messages.length === 0) return state;

      const currentUserId = normalizeUserId(getCurrentUserId());
      const updatedMessages = { ...state.messages };
      const updatedRooms = { ...state.rooms };

      // 1. Build a lookup map of existing messages to handle ID swaps (temp -> permanent)
      const lookupMap = new Map<string, string>();
      Object.values(state.messages).forEach(m => {
        if (m.temp_id) lookupMap.set(m.temp_id, m.id);
        if (m.idempotency_key) lookupMap.set(m.idempotency_key, m.id);
        lookupMap.set(m.id, m.id);
      });

      messages.forEach((message) => {
        const roomId = message.room_id;
        const room = updatedRooms[roomId] || createEmptyRoom(roomId);

        // 2. Identify if this message already exists (by ID, TempID, or IdempotencyKey)
        const existingId = lookupMap.get(message.id) ||
          (message.temp_id ? lookupMap.get(message.temp_id) : null) ||
          (message.idempotency_key ? lookupMap.get(message.idempotency_key) : null);

        const existingMsg = existingId ? updatedMessages[existingId] : null;

        // 3. Merge data
        const mergedMessage: Message = existingMsg ? {
          ...existingMsg,
          ...message,
          id: message.id, // Always prefer permanent ID
          status: (message.status === "read" || existingMsg.status === "read") ? "read" :
            (message.status === "delivered" || existingMsg.status === "delivered") ? "delivered" :
              message.status,
        } : message;

        // 4. Update the main message store
        updatedMessages[mergedMessage.id] = mergedMessage;

        // 5. Cleanup: If we upgraded from a temp_id, remove the old key
        if (existingId && existingId !== mergedMessage.id) {
          delete updatedMessages[existingId];
          const idx = room.messageIds.indexOf(existingId);
          if (idx !== -1) room.messageIds[idx] = mergedMessage.id;
        } else if (!room.messageIds.includes(mergedMessage.id)) {
          room.messageIds.push(mergedMessage.id);
        }

        // 6. Sort and cap messages for this room (Memory Management)
        const compareMessages = (idA: string, idB: string) => {
          const mA = updatedMessages[idA];
          const mB = updatedMessages[idB];
          if (!mA || !mB) return 0;
          if (mA.sequence_id && mB.sequence_id) return mA.sequence_id - mB.sequence_id;
          return (mA.sent_at || 0) - (mB.sent_at || 0);
        };

        const sortedIds = Array.from(new Set(room.messageIds)).sort(compareMessages);
        const finalIds = sortedIds.slice(-500); // Maintain only last 500 in memory

        // 7. Room Move Logic: If the room ID changed, remove from old room
        if (existingMsg && existingMsg.room_id !== roomId) {
          const oldRoomId = existingMsg.room_id;
          const oldRoom = updatedRooms[oldRoomId];
          if (oldRoom) {
            updatedRooms[oldRoomId] = {
              ...oldRoom,
              messageIds: oldRoom.messageIds.filter(id => id !== existingId)
            };
          }
        }

        // 8. Update Room Metadata (Unread count, Last Message)
        const shouldIncrementUnread = !skipUnread && state.activeRoomId !== roomId && normalizeUserId(mergedMessage.sender_id) !== currentUserId && !existingId;

        updatedRooms[roomId] = {
          ...room,
          messageIds: finalIds,
          unread_count: state.activeRoomId === roomId ? 0 :
            shouldIncrementUnread ? (room.unread_count || 0) + 1 : room.unread_count,
          last_message: room.last_message ? {
            id: room.last_message.id,
            content: room.last_message.content,
            created_at: room.last_message.created_at,
            sender_id: room.last_message.sender_id,
            sender_name: room.last_message.sender_name,
            status: (room.last_message.status || "sent").toLowerCase() as any,
          } : null,
          lastSyncedSeq: Math.max(room.lastSyncedSeq || 0, mergedMessage.sequence_id || 0),
        };
      });

      return { messages: updatedMessages, rooms: updatedRooms };
    }),

  addMessage: (message, skipUnread = false) => get().addMessages([message], skipUnread),

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

      const results = response.data?.results || response.data;
      if (Array.isArray(results) && results.length > 0) {
        get().addMessages(results.map((msg: any) => mapHistoryMessage(roomId, msg)).reverse(), true);
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

  updateMessageStatus: (tempId, status, messageId) =>
    set((state) => {
      const id = messageId || tempId;
      const existing = state.messages[id];
      if (!existing) return state;

      return {
        messages: {
          ...state.messages,
          [id]: { ...existing, status },
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

  sendMessage: async (roomId, content, file, replyToId, skipCompression = false) => {
    const state = get();
    const user = useAuthStore.getState().user;
    if (!user || (!roomId && !state.pendingUser)) return;

    const trimmedContent = content.trim();
    if (!trimmedContent && !file) return;

    let targetRoomId = roomId;
    let targetUserId = "";
    let routeTarget = targetRoomId || "";

    if (!targetRoomId && state.pendingUser) {
      targetUserId = normalizeUserId(state.pendingUser.user_id);
      routeTarget = targetUserId;
    } else if (targetRoomId) {
      const room = state.rooms[targetRoomId];
      targetUserId = getDirectRecipientUserId(room);
      routeTarget = room?.type === "DIRECT" && targetUserId ? targetUserId : targetRoomId;
    }

    const currentUserId = normalizeUserId(user.id);
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: Message = {
      id: tempId,
      temp_id: tempId,
      idempotency_key: tempId,
      sender_id: currentUserId,
      room_id: targetRoomId || "",
      content: trimmedContent,
      type: file ? (file.type.startsWith("image/") ? "IMAGE" : "FILE") : "TEXT",
      sent_at: Date.now(),
      status: "sending",
      reply_to_id: replyToId,
      is_edited: false,
      attachments: [],
    };

    // If there is a file, prepare attachment metadata
    if (file) {
      let mediaType: "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" | undefined;
      if (file.type.startsWith("image/")) mediaType = "IMAGE";
      else if (file.type.startsWith("video/")) mediaType = "VIDEO";
      else if (file.type.startsWith("audio/")) mediaType = "AUDIO";
      else mediaType = "DOCUMENT";

      message.metadata = {
        attachment: {
          type: mediaType,
          filename: file.name,
          size: file.size,
          mime_type: file.type,
          processed: false,
          progress: 0,
          local_url: URL.createObjectURL(file), // For instant preview
        }
      };
    }

    get().addMessage(message);

    if (file) {
      try {
        // Only compress if it's an image and skipCompression is false
        const shouldOptimize = !skipCompression && file.type.startsWith("image/");
        const optimizedFile = shouldOptimize ? await compressImage(file) : file;

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB MinIO/S3 Minimum
        let s3Key = "";

        if (optimizedFile.size <= CHUNK_SIZE) {
          // 🚀 Single Part Upload for speed
          const { signed_url, s3_key: key } = await requestSignedUrl(optimizedFile.name, optimizedFile.type);
          s3Key = key;
          const cancelRef = { abort: () => { } };
          abortControllers.set(tempId, cancelRef);

          await uploadFileToS3(optimizedFile, signed_url, (progress: number) => {
            get().updateUploadProgress(tempId, progress);
          }, cancelRef);
        } else {
          // 🚀 Multipart "Byte-by-Byte" Upload
          const { upload_id, s3_key: key } = await initMultipartUpload(optimizedFile.name, optimizedFile.type);
          s3Key = key;
          const totalParts = Math.ceil(optimizedFile.size / CHUNK_SIZE);
          const uploadedParts: { part_number: number; etag: string }[] = [];

          const cancelRef = { abort: () => { } };
          abortControllers.set(tempId, cancelRef);

          for (let i = 0; i < totalParts; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, optimizedFile.size);
            const partBlob = optimizedFile.slice(start, end);
            const partNumber = i + 1;

            const partSignedUrl = await getPartSignedUrl(s3Key, upload_id, partNumber);
            const etag = await uploadPart(partBlob, partSignedUrl, (partProgress: number) => {
              const overallProgress = ((i / totalParts) * 100) + (partProgress / totalParts);
              get().updateUploadProgress(tempId, overallProgress);
            }, cancelRef);

            uploadedParts.push({ part_number: partNumber, etag });
          }

          await completeMultipartUpload(s3Key, upload_id, uploadedParts);
        }

        abortControllers.delete(tempId);

        // Mark as success briefly for the UI
        get().updateUploadProgress(tempId, 100, true);
        setTimeout(() => get().updateUploadProgress(tempId, 100, false), 2000);

        // Update message with the s3_key before sending to socket
        message.metadata.attachment.s3_key = s3Key;
        message.metadata.attachment.size = optimizedFile.size;
        message.metadata.attachment.progress = 100;

        // Final store update for the s3_key
        set((state) => {
          const msg = state.messages[tempId];
          if (!msg) return state;
          return {
            messages: { ...state.messages, [tempId]: { ...msg, metadata: message.metadata } }
          };
        });
      } catch (error: any) {
        abortControllers.delete(tempId);
        if (error.message === "UPLOAD_CANCELLED") {
          console.log("📤 Upload cancelled for:", tempId);
          set((state) => {
            const updatedMessages = { ...state.messages };
            delete updatedMessages[tempId];
            return { messages: updatedMessages };
          });
          return;
        }
        console.error("❌ Media upload failed:", error);
        if (file) failedFiles.set(tempId, file);
        get().updateMessageStatus(tempId, "failed");
        return;
      }
    }

    sendOutboxEntry(message, routeTarget, targetUserId);
  },

  markAsRead: (roomId, sequenceId) => {
    chatSocket.send("read_receipt", {
      target: roomId,
      payload: {
        sequence_id: sequenceId,
      },
    });
  },

  cancelUpload: (tempId) => {
    const controller = abortControllers.get(tempId);
    if (controller) {
      controller.abort();
    }
  },

  resendMessage: async (tempId) => {
    const state = get();
    const msg = state.messages[tempId];
    if (!msg || msg.status !== "failed") return;

    const file = failedFiles.get(tempId);
    failedFiles.delete(tempId);

    // Reset status and retry
    get().updateMessageStatus(tempId, "sending");

    // Extract room info
    const roomId = msg.room_id;
    const room = state.rooms[roomId];
    const targetUserId = getDirectRecipientUserId(room);
    const routeTarget = room?.type === "DIRECT" && targetUserId ? targetUserId : roomId;

    if (file) {
      try {
        const optimizedFile = file.type.startsWith("image/") ? await compressImage(file) : file;
        const { signed_url, s3_key } = await requestSignedUrl(optimizedFile.name, optimizedFile.type);
        const cancelRef = { abort: () => { } };
        abortControllers.set(tempId, cancelRef);

        await uploadFileToS3(optimizedFile, signed_url, (progress: number) => {
          set((state) => {
            const m = state.messages[tempId];
            if (!m || !m.metadata?.attachment) return state;
            return {
              messages: {
                ...state.messages,
                [tempId]: {
                  ...m,
                  metadata: { ...m.metadata, attachment: { ...m.metadata.attachment, progress, size: optimizedFile.size } }
                }
              }
            };
          });
        }, cancelRef);

        abortControllers.delete(tempId);

        set((state) => {
          const m = state.messages[tempId];
          if (!m || !m.metadata?.attachment) return state;
          return {
            messages: {
              ...state.messages,
              [tempId]: {
                ...m,
                metadata: { ...m.metadata, attachment: { ...m.metadata.attachment, isSuccess: true } }
              }
            }
          };
        });

        setTimeout(() => {
          set((state) => {
            const m = state.messages[tempId];
            if (!m || !m.metadata?.attachment) return state;
            return {
              messages: {
                ...state.messages,
                [tempId]: {
                  ...m,
                  metadata: { ...m.metadata, attachment: { ...m.metadata.attachment, isSuccess: false } }
                }
              }
            };
          });
        }, 2000);

        msg.metadata!.attachment!.s3_key = s3_key;
        msg.metadata!.attachment!.size = optimizedFile.size;
        msg.metadata!.attachment!.progress = 100;

        set((state) => ({
          messages: { ...state.messages, [tempId]: { ...msg, status: "sending" } }
        }));
      } catch (error: any) {
        abortControllers.delete(tempId);
        if (error.message === "UPLOAD_CANCELLED") return;
        failedFiles.set(tempId, file);
        get().updateMessageStatus(tempId, "failed");
        return;
      }
    }

    sendOutboxEntry(msg, routeTarget, targetUserId);
  },

  updateUploadProgress: (tempId, progress, isSuccess = false) => {
    set((state) => {
      const msg = state.messages[tempId];
      if (!msg || !msg.metadata?.attachment) return state;
      return {
        messages: {
          ...state.messages,
          [tempId]: {
            ...msg,
            metadata: {
              ...msg.metadata,
              attachment: {
                ...msg.metadata.attachment,
                progress,
                isSuccess
              }
            }
          }
        }
      };
    });
  },
}));


chatSocket.on("status", (data) => {
  if (data.connected) {
    useChatStore.setState({ isReady: true });
    // Fetch rooms once per WS session (not on every component mount)
    if (!roomsFetchedForSession) {
      void useChatStore.getState().fetchRooms();
    }
    return;
  }

  console.log("🔌 Chat Socket disconnected");
  useChatStore.setState({ isReady: false });
  roomsFetchedForSession = false; // reset so next reconnect refetches
});

chatSocket.on("message_ack", (data) => {
  const { temp_id, message_id, sequence_id, status, success, sender_id, sent_at } = data;
  clearPendingAck(temp_id);

  const state = useChatStore.getState();
  const tempMsg = state.messages[temp_id];

  if (tempMsg) {
    const finalId = message_id || temp_id;
    const finalRoomId = data.room_id || tempMsg.room_id;

    const updatedMsg: Message = {
      ...tempMsg,
      id: finalId,
      room_id: finalRoomId,
      sequence_id: sequence_id || tempMsg.sequence_id,
      status: success ? (status || "acknowledged") : "failed",
      // Enrich with Go-provided sender data if available
      sender_id: sender_id || tempMsg.sender_id,
      sent_at: sent_at || tempMsg.sent_at,
    };

    state.addMessage(updatedMsg);

    if (finalRoomId && tempMsg.room_id === "" && finalRoomId !== "") {
      // New room assigned — force a fresh fetch on next opportunity
      roomsFetchedForSession = false;
      void state.fetchRooms();
    }
  }
});

chatSocket.on("chat_delivery", (data) => {
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
    sender_id: normalizeUserId(sender_id),
    room_id,
    content,
    sequence_id,
    sent_at: created_at ? new Date(created_at).getTime() : Date.now(),
    status: (status || "sent").toLowerCase() as any,
    metadata: payload.metadata || existing?.metadata,

    // New Fields
    type: payload.type || existing?.type || "TEXT",
    is_edited: payload.is_edited || false,
    attachments: payload.attachments || existing?.attachments || [],
    reply_to: payload.reply_to || null,
    reply_to_id: payload.reply_to_id,
    forwarded_from: payload.forwarded_from,
    delivered_at: payload.delivered_at,
    seen_at: payload.seen_at,
  }, false);

  if (isNewRoom) {
    void state.fetchRooms();
  }
});

chatSocket.on("user_typing", (data) => {
  const payload = data.payload || data;
  const { room_id, user_id, is_typing } = payload;
  const currentUserId = normalizeUserId(getCurrentUserId());

  if (normalizeUserId(user_id) === currentUserId) return;

  useChatStore.getState().setTyping(room_id, user_id, is_typing);
});

chatSocket.on("chat_update", (data) => {
  const payload = data.payload || data;
  const { id, metadata } = payload;
  const state = useChatStore.getState();
  const existingMsg = state.messages[id];

  if (existingMsg) {
    state.addMessage({
      ...existingMsg,
      metadata: {
        ...existingMsg.metadata,
        ...metadata,
        attachment: {
          ...existingMsg.metadata?.attachment,
          ...metadata?.attachment,
          processed: true
        }
      }
    }, false);
  }
});

chatSocket.on("chat_read", (data) => {
  const payload = data.payload || data;
  const { room_id, sequence_id, sender_id } = payload;
  const currentUserId = normalizeUserId(getCurrentUserId());

  if (normalizeUserId(sender_id) === currentUserId) return;

  useChatStore.setState((state) => {
    const updatedMessages = { ...state.messages };
    Object.keys(updatedMessages).forEach((key) => {
      const msg = updatedMessages[key];
      if (
        msg.room_id === room_id &&
        msg.sequence_id &&
        Number(msg.sequence_id) <= Number(sequence_id) &&
        normalizeUserId(msg.sender_id) === currentUserId &&
        msg.status !== "read"
      ) {
        updatedMessages[key] = { ...msg, status: "read" };
      }
    });
    return { messages: updatedMessages };
  });
});

chatSocket.on("chat_status", (data) => {
  const payload = data.payload || data;
  const { room_id, last_read_seq, message_id, id, temp_id, status } = payload;
  const currentUserId = normalizeUserId(getCurrentUserId());
  const state = useChatStore.getState();

  const targetMsgId = message_id || id || temp_id;
  if (targetMsgId) {
    const msg = state.messages[targetMsgId] ||
      Object.values(state.messages).find(m => m.temp_id === temp_id || m.id === targetMsgId);

    if (msg && status) {
      const mappedStatus = status.toLowerCase() === "sent" ? "delivered" : status.toLowerCase();
      const finalRoomId = room_id || msg.room_id;

      const updatedMsg: Message = {
        ...msg,
        status: mappedStatus as any,
        room_id: finalRoomId,
        id: message_id || id || msg.id
      };

      state.addMessage(updatedMsg);

      if (finalRoomId && state.pendingUser && !state.activeRoomId) {
        void state.fetchRooms();
        useChatStore.setState({ activeRoomId: finalRoomId, pendingUser: null });
      }
    }
  }

  if (last_read_seq) {
    useChatStore.setState((state) => {
      const updatedMessages = { ...state.messages };
      Object.keys(updatedMessages).forEach((key) => {
        const msg = updatedMessages[key];
        if (
          msg.room_id === room_id &&
          msg.sequence_id &&
          Number(msg.sequence_id) <= Number(last_read_seq) &&
          normalizeUserId(msg.sender_id) === currentUserId &&
          msg.status !== "read"
        ) {
          updatedMessages[key] = { ...msg, status: "read" };
        }
      });
      return { messages: updatedMessages };
    });
  }
});

presenceSocket.on("user_presence", (data) => {
  const payload = data.payload || data;
  let { user_id, status } = payload;
  if (!user_id) return;
  user_id = user_id.toLowerCase();
  if (user_id === normalizeUserId(getCurrentUserId())) return;

  useChatStore.setState((state) => {
    const nextOnline = new Set(state.onlineUsers);
    const nextLastSeen = { ...state.lastSeen };

    if (status === "online") {
      nextOnline.add(user_id);
    } else {
      nextOnline.delete(user_id);
      if (typeof status === "string" && status.startsWith("last_seen:")) {
        nextLastSeen[user_id] = parseInt(status.split(":")[1]);
      }
    }
    return { onlineUsers: nextOnline, lastSeen: nextLastSeen };
  });
});

presenceSocket.on("presence_update", (data) => {
  const statusMap = data.payload || data;
  if (!statusMap) return;

  useChatStore.setState((state) => {
    const nextOnline = new Set(state.onlineUsers);
    const nextLastSeen = { ...state.lastSeen };

    Object.entries(statusMap).forEach(([id_raw, status]: [string, any]) => {
      const id = id_raw.toLowerCase();
      if (id === normalizeUserId(getCurrentUserId())) return;
      if (status === "online") {
        nextOnline.add(id);
      } else {
        nextOnline.delete(id);
        if (typeof status === "string" && status.startsWith("last_seen:")) {
          nextLastSeen[id] = parseInt(status.split(":")[1]);
        }
      }
    });
    return { onlineUsers: nextOnline, lastSeen: nextLastSeen };
  });
});

/**
 * room_created — pushed by Django via Redis pub/sub on the presence channel
 * when the OTHER user creates a DM with you.
 * This injects the room into the store so it appears in your sidebar in real-time.
 */
presenceSocket.on("room_created", (data) => {
  const room = data.payload || data;
  if (!room?.id) return;

  useChatStore.setState((state) => {
    const existing = state.rooms[room.id];
    if (existing) return state; // already have it
    return {
      rooms: {
        ...state.rooms,
        [room.id]: {
          ...room,
          messageIds: [],
          typingUsers: new Set<string>(),
          lastReadSeq: 0,
          lastSyncedSeq: 0,
        }
      }
    };
  });

  // Auto-subscribe to the new room's WS channel so messages arrive immediately
  const store = useChatStore.getState();
  store.subscribeRoom(room.id);

  // Subscribe to presence of the other participant
  if (Array.isArray(room.participants)) {
    const myId = normalizeUserId(getCurrentUserId());
    const peerIds = room.participants
      .map((p: any) => p.user_id as string)
      .filter((id: string) => normalizeUserId(id) !== myId);
    if (peerIds.length > 0) {
      store.subscribePresence(peerIds);
      store.getPresence(peerIds);
    }
  }
});

export const initializeSockets = () => {
  chatSocket.connect();
  presenceSocket.connect();
};
