import { httpClient } from "@/shared/http/client";
import { useChatStore } from "../state/chatStore";

interface DirectRoomResponse {
  id: string;
  name: string;
  type: string;
  display_name: string;
  display_avatar: string | null;
  participants: any[];
  last_message: any;
  unread_count: number;
}

/**
 * Creates or retrieves an existing DM room with a contact.
 * 
 * Optimized flow:
 * 1. POST to create/get the room — backend returns full room data
 * 2. Inject the room directly into the store (no full list refetch needed)
 * 3. Set it as the active room immediately
 * 4. Return the room ID to the caller for navigation
 */
export async function startDirectChat(clientId: string): Promise<string> {
  const { data } = await httpClient.post<DirectRoomResponse>(`/chat/v1/rooms/dm/${clientId}/`);
  
  if (!data?.id) {
    throw new Error("Chat room was not returned by the server.");
  }

  // Inject the room directly into the store — no full list refresh needed
  useChatStore.setState((state) => {
    const existing = state.rooms[data.id];
    return {
      rooms: {
        ...state.rooms,
        [data.id]: {
          ...data,
          messageIds: existing?.messageIds || [],
          typingUsers: existing?.typingUsers || new Set(),
          lastReadSeq: existing?.lastReadSeq || 0,
          lastSyncedSeq: existing?.lastSyncedSeq || 0,
          unread_count: existing?.unread_count || 0,
        }
      }
    };
  });

  return data.id;
}
