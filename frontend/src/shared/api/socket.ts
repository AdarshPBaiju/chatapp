import { BaseSocket } from "../lib/socket/BaseSocket";

class ChatSocket extends BaseSocket {
  private static instance: ChatSocket;

  private constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const url = `${protocol}//${host}/ws`;

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
