import { httpClient } from "@/shared/http/client";
import { useChatStore } from "../state/chatStore";

interface DirectRoomResponse {
  id: string;
}

export async function startDirectChat(clientId: string) {
  const { data } = await httpClient.post<DirectRoomResponse>(`/chat/v1/rooms/dm/${clientId}/`);
  if (!data?.id) {
    throw new Error("Chat room was not returned by the server.");
  }

  await useChatStore.getState().fetchRooms();
  return data.id;
}
