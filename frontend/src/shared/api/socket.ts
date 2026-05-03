import { BaseSocket } from "../lib/socket/BaseSocket";
import { tokenManager } from "@/shared/auth/tokenManager";

class ChatAppSocket extends BaseSocket {
  private path: string;

  constructor(path: string) {
    super({
      url: "", // Will be set in connect()
      autoConnect: false,
    });
    this.path = path;
  }

  private getUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    // For local dev, use :8083 if needed, but assuming Nginx gateway
    const token = tokenManager.getAccess();
    return `${protocol}//${host}${this.path}${token ? `?token=${token}` : ""}`;
  }

  public connect() {
    this.options.url = this.getUrl();
    super.connect();
  }

  public reconnect() {
    this.disconnect();
    this.connect();
  }
}

export const chatSocket = new ChatAppSocket("/ws/chat");
export const presenceSocket = new ChatAppSocket("/ws/presence");

export const initializeSockets = () => {
  chatSocket.connect();
  presenceSocket.connect();
};

// For backward compatibility during migration
export const socket = chatSocket;
