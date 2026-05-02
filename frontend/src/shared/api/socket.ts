import { BaseSocket } from "../lib/socket/BaseSocket";
import { tokenManager } from "@/shared/auth/tokenManager";

class ChatSocket extends BaseSocket {
  private static instance: ChatSocket;

  private constructor() {
    super({
      url: "", // Will be set in connect()
      autoConnect: false,
    });
  }

  private getUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const token = tokenManager.getAccess();
    return `${protocol}//${host}/ws${token ? `?token=${token}` : ""}`;
  }

  public connect() {
    this.options.url = this.getUrl();
    super.connect();
  }

  /**
   * Forces a fresh connection with the latest token
   */
  public reconnect() {
    this.disconnect();
    this.connect();
  }

  public static getInstance(): ChatSocket {
    if (!ChatSocket.instance) {
      ChatSocket.instance = new ChatSocket();
    }
    return ChatSocket.instance;
  }
}

export const socket = ChatSocket.getInstance();
