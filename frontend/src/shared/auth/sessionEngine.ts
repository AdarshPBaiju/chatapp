/**
 * sessionEngine.ts
 *
 * The Predictive Session Lifecycle Engine.
 *
 * This is the SINGLE source of truth for authentication state timing.
 * It eliminates reactive 401 handling by scheduling proactive refresh
 * before the access token ever expires.
 *
 * State machine:
 *   IDLE → ACTIVE → REFRESHING → ACTIVE  (normal cycle)
 *                 ↘ EXPIRED → IDLE       (refresh token dead / tampered)
 */

import { authStorage } from "@/shared/lib/storage";
import { tokenManager } from "@/shared/auth/tokenManager";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionState = "IDLE" | "ACTIVE" | "REFRESHING" | "EXPIRED";

export type SessionTokens = {
  access: string;
  refresh: string;
  access_exp: number; // Unix seconds
  refresh_exp: number; // Unix seconds
};

type OnExpiredFn = () => void;
type RefreshFn = () => Promise<SessionTokens>;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Fire refresh this many seconds before the access token expires. */
const REFRESH_BUFFER_SEC = 60;

/** localStorage key used as a cross-tab mutex. */
const REFRESH_LOCK_KEY = "chatapp.session.refreshing_at";

/** BroadcastChannel name shared across all tabs of this origin. */
const CHANNEL_NAME = "chatapp_session_channel";

// ─── Engine ─────────────────────────────────────────────────────────────────

class SessionEngine {
  private state: SessionState = "IDLE";
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel;
  private onExpired: OnExpiredFn | null = null;
  private doRefresh: RefreshFn | null = null;

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = this.handleBroadcast.bind(this);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register callbacks. Must be called once during app bootstrap
   * before startSession is ever called.
   */
  init(doRefresh: RefreshFn, onExpired: OnExpiredFn) {
    this.doRefresh = doRefresh;
    this.onExpired = onExpired;
  }

  /**
   * Start (or restart) the session clock with a fresh set of tokens.
   * Called after login, bootstrap refresh, or a successful proactive refresh.
   */
  startSession(tokens: SessionTokens) {
    this.cancelTimer();
    tokenManager.setTokens(tokens.access, tokens.access_exp, tokens.refresh_exp);
    authStorage.setRefresh(tokens.refresh);
    authStorage.setRefreshExp(tokens.refresh_exp);
    this.state = "ACTIVE";
    this.scheduleRefresh(tokens.access_exp);
  }

  /**
   * Immediately attempt a refresh (used when an unexpected 401 slips through).
   * Guards against concurrent calls.
   */
  async forceRefresh(): Promise<void> {
    if (this.state === "REFRESHING") return;
    await this.executeRefresh();
  }

  /** Tear down the engine cleanly. Called on logout. */
  stop() {
    this.cancelTimer();
    tokenManager.clear();
    localStorage.removeItem(REFRESH_LOCK_KEY);
    this.state = "IDLE";
  }

  getState(): SessionState {
    return this.state;
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  private scheduleRefresh(accessExpTs: number) {
    const nowSec = Math.floor(Date.now() / 1000);
    const delayMs = Math.max((accessExpTs - nowSec - REFRESH_BUFFER_SEC) * 1000, 0);
    this.timerId = setTimeout(() => this.executeRefresh(), delayMs);
  }

  private cancelTimer() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // ── Refresh Execution (with cross-tab leadership) ──────────────────────────

  private async executeRefresh(): Promise<void> {
    if (this.state !== "ACTIVE") return;
    if (!this.doRefresh) return;

    // Cross-tab mutex: check if another tab already owns the refresh.
    const nowMs = Date.now();
    const lockTs = parseInt(localStorage.getItem(REFRESH_LOCK_KEY) ?? "0", 10);
    const anotherTabIsRefreshing = lockTs > 0 && nowMs - lockTs < 15_000;

    if (anotherTabIsRefreshing) {
      // Another tab has the lock — wait for the broadcast instead of racing.
      return;
    }

    // Claim the lock.
    localStorage.setItem(REFRESH_LOCK_KEY, nowMs.toString());
    this.state = "REFRESHING";

    try {
      const tokens = await this.doRefresh();
      // Broadcast success to waiting tabs before applying locally.
      this.channel.postMessage({
        type: "SESSION_REFRESHED",
        tokens,
      });
      this.applyNewTokens(tokens);
    } catch (err: any) {
      localStorage.removeItem(REFRESH_LOCK_KEY);
      this.channel.postMessage({ type: "SESSION_REFRESH_FAILED" });
      this.handleRefreshFailure(err);
    }
  }

  private applyNewTokens(tokens: SessionTokens) {
    localStorage.removeItem(REFRESH_LOCK_KEY);
    this.state = "ACTIVE";
    this.cancelTimer();
    tokenManager.setTokens(tokens.access, tokens.access_exp, tokens.refresh_exp);
    authStorage.setRefresh(tokens.refresh);
    authStorage.setRefreshExp(tokens.refresh_exp);
    this.scheduleRefresh(tokens.access_exp);
  }

  private handleRefreshFailure(err: any) {
    this.cancelTimer();
    this.state = "EXPIRED";
    tokenManager.clear();
    this.onExpired?.();
  }

  // ── BroadcastChannel ───────────────────────────────────────────────────────

  private handleBroadcast(event: MessageEvent) {
    const { type, tokens } = event.data ?? {};

    if (type === "SESSION_REFRESHED" && tokens) {
      // Another tab refreshed — adopt its tokens and reschedule our clock.
      if (this.state === "ACTIVE" || this.state === "REFRESHING") {
        this.applyNewTokens(tokens as SessionTokens);
      }
    }

    if (type === "SESSION_REFRESH_FAILED") {
      // The leading tab failed. We can try to take over, or just expire.
      // Simple policy: expire. The user will be logged out in all tabs.
      if (this.state === "REFRESHING" || this.state === "ACTIVE") {
        this.cancelTimer();
        this.state = "EXPIRED";
        tokenManager.clear();
        this.onExpired?.();
      }
    }

    if (type === "SESSION_TERMINATED") {
      // Explicit logout from another tab.
      this.stop();
      this.onExpired?.();
    }
  }

  /** Broadcast an explicit logout to all other tabs. */
  broadcastLogout() {
    this.channel.postMessage({ type: "SESSION_TERMINATED" });
  }
}

export const sessionEngine = new SessionEngine();
