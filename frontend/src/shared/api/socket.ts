import { BaseSocket } from "../lib/socket/BaseSocket";
import { useAuthStore } from "@/modules/auth/state/authState";

class ChatSocket extends BaseSocket {
  private static instance: ChatSocket;

  private constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    // Attach user_id so the gateway can route messages to the correct user
    const userId = useAuthStore.getState().user?.id || "";
    const url = `${protocol}//${host}/ws${userId ? `?user_id=${userId}` : ""}`;

    super({
      url,
      autoConnect: false,
    });
  }

  public static getInstance(): ChatSocket {
    if (!ChatSocket.instance) {
      ChatSocket.instance = new ChatSocket();
    }
    return ChatSocket.instance;
  }
}

export const socket = ChatSocket.getInstance();
