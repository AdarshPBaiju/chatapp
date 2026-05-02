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
  protected pendingRequests: Map<string, { resolve: Function; reject: Function; timer: any }> = new Map();
  protected reconnectAttempts = 0;
  protected options: Required<SocketOptions>;
  private heartbeatTimer: any;

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

    // Monitor visibility to adjust heartbeat
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this.onVisibilityChange());
    }
  }

  public connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    console.log(`%c[Socket] %cConnecting to ${this.options.url}`, "color: #06b6d4; font-weight: bold", "color: inherit");
    this.socket = new WebSocket(this.options.url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
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
      this.send("ping", { ts: Date.now() });
    }, 30000); // 30s heartbeat
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
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(30000, this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1));
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
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...payload }));
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }
}
