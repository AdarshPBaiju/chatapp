export type UserInfo = {
  id: string;
  email: string;
  full_name?: string;
};

export type SessionInfo = {
  session_id: string;
  access_jti: string;
  refresh_jti: string;
  device: string;
  started_at: number;
  last_seen_at: number;
  is_current: boolean;
  city?: string;
  country_code?: string;
};

export type RestrictedAuthPayload = {
  is_restricted: true;
  access: string;
  active_sessions: SessionInfo[];
  user?: UserInfo;
};

export type FullAuthPayload = {
  is_restricted: false;
  access: string;
  refresh: string;
  user: UserInfo;
};

export type PendingVerification = {
  user_id: string;
  email: string;
  resend_interval: number;
};

export type AuthStatus = "anonymous" | "pending_verification" | "restricted" | "full";

export type LoginRequest = {
  email: string;
  password: string;
};

export type SignUpRequest = {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
};

export type LoginResponse =
  | {
      status: "pending_verification";
      user_id: string;
      email: string;
      resend_interval: number;
    }
  | RestrictedAuthPayload
  | FullAuthPayload;
