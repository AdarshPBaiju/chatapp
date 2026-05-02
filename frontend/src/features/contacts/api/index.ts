import { httpClient } from "@/shared/http/client";
import { ContactUser, SearchResponse } from "../types";

export async function searchUsers(query: string): Promise<SearchResponse> {
  const res = await httpClient.get<SearchResponse>(`/users/client/discovery/search/?q=${encodeURIComponent(query)}`);
  return res.data;
}

export async function fetchContacts(type: "accepted" | "pending" | "blocked" = "accepted") {
  const res = await httpClient.get<{ success: boolean; data: ContactUser[] }>(`/users/client/contacts/?type=${type}`);
  return res.data;
}

export async function manageContact(clientId: string, action: "add" | "accept" | "decline" | "block" | "unblock" | "remove" | "update_nickname", nickname?: string | null) {
  const res = await httpClient.post<{ success: boolean; message: string }>(`/users/client/contacts/manage/`, {
    client_id: clientId,
    action,
    nickname,
  });
  return res.data;
}
