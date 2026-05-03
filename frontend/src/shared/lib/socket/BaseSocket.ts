export type SocketEventHandler = (data: any) => void;

export interface SocketOptions {
  url: string;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
}

export class BaseSocket {
  protected socket: WebSocket | null = null;
  protected handlers: Map<string, Set<SocketEventHandler>> = new Map();
  private heartbeatTimer: any;
  private reconnectTimer: any;
  private messageQueue: Array<{ type: string; payload: any; correlation_id?: string }> = [];
  private isReconnecting = false;
  protected options: SocketOptions;
  protected reconnectAttempts = 0;
  private pendingRequests: Map<string, { resolve: any; reject: any; timer: any }> = new Map();

  constructor(options: SocketOptions) {
    this.options = {
      autoConnect: true,
      maxReconnectAttempts: 10, // Increased for advanced tier
      reconnectInterval: 1000,
      ...options,
    };

    if (this.options.autoConnect) {
      this.connect();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this.onVisibilityChange());
    }
  }

  public get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public connect() {
    if (this.socket?.readyState === WebSocket.OPEN || this.isReconnecting) return;

    console.log(`%c[Socket] %cConnecting to ${this.options.url}`, "color: #06b6d4; font-weight: bold", "color: inherit");
    this.socket = new WebSocket(this.options.url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.startHeartbeat();
      this.flushMessageQueue(); // Send queued messages
      this.emit("status", { connected: true });
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle Request-Response pattern
        if (data.correlation_id && this.pendingRequests.has(data.correlation_id)) {
          const { resolve, timer } = this.pendingRequests.get(data.correlation_id)!;
          clearTimeout(timer);
          this.pendingRequests.delete(data.correlation_id);
          resolve(data.payload || data);
          return;
        }

        if (data.type) {
          this.emit(data.type, data.payload || data);
        }
      } catch (e) {
        this.emit("raw", event.data);
      }
    };

    this.socket.onclose = (_event) => {
      this.stopHeartbeat();
      this.emit("status", { connected: false });
      this.attemptReconnect();
    };

    this.socket.onerror = (error) => {
      this.emit("error", error);
    };
  }

  /**
   * Request-Response pattern over WebSocket
   */
  public request<T>(type: string, payload: any, timeout = 5000): Promise<T> {
    const correlation_id = Math.random().toString(36).substring(2, 15);
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(correlation_id)) {
          this.pendingRequests.delete(correlation_id);
          reject(new Error(`Socket request timeout: ${type}`));
        }
      }, timeout);

      this.pendingRequests.set(correlation_id, { resolve, reject, timer });

      this.send(type, { ...payload, correlation_id });
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send("ping", { payload: { ts: Date.now() } });
    }, 15000); // 15s heartbeat for better reliability
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private onVisibilityChange() {
    if (document.visibilityState === "visible") {
      this.startHeartbeat();
      if (this.socket?.readyState === WebSocket.CLOSED) this.connect();
    } else {
      // Slow down heartbeat in background
      this.stopHeartbeat();
      this.heartbeatTimer = setInterval(() => this.send("ping", {}), 120000);
    }
  }

  protected attemptReconnect() {
    if (this.reconnectAttempts < (this.options.maxReconnectAttempts || 10)) {
      this.reconnectAttempts++;
      const delay = Math.min(30000, (this.options.reconnectInterval || 1000) * Math.pow(1.5, this.reconnectAttempts - 1));
      setTimeout(() => this.connect(), delay);
    }
  }

  public on(event: string, handler: SocketEventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  public off(event: string, handler: SocketEventHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: string, data: any) {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  public send(type: string, payload: any) {
    const message = { type, ...payload };
    
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is restored
      this.messageQueue.push(message);
      if (!this.isReconnecting && this.socket?.readyState !== WebSocket.CONNECTING) {
        this.connect();
      }
    }
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this.socket.send(JSON.stringify(message));
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
