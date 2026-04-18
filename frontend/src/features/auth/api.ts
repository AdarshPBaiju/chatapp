import { httpClient } from "@/shared/http/client";
import { unwrapEnvelope } from "@/shared/lib/apiResponse";
import { ApiEnvelope } from "@/shared/types/api";
import {
  LoginRequest,
  LoginResponse,
  RestrictedAuthPayload,
  UserInfo,
  IdentityChallengePayload,
} from "@/features/auth/types";

export type SignUpResponse = {
  id: string;
  email: string;
  full_name?: string;
  resend_interval: number;
};

export type OTPValidationResponse = RestrictedAuthPayload | {
  is_restricted: false;
  access: string;
  refresh: string;
  access_exp: number;
  refresh_exp: number;
  user: UserInfo;
};

export type RefreshResponse =
  | RestrictedAuthPayload
  | {
      is_restricted: false;
      access: string;
      refresh: string;
      access_exp: number;
      refresh_exp: number;
    };

export async function signUpRequest(payload: { email: string }): Promise<{ email: string; resend_interval: number }> {
  const response = await httpClient.post<ApiEnvelope<{ email: string; resend_interval: number }>>("/signup/request/", payload);
  return unwrapEnvelope(response);
}

export async function signUpVerify(payload: {
  email: string;
  otp_code: string;
}): Promise<{ signup_token: string }> {
  const response = await httpClient.post<ApiEnvelope<{ signup_token: string }>>(
    "/signup/verify/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function signUpFinalize(payload: {
  signup_token: string;
  full_name: string;
  password: string;
  confirm_password: string;
}): Promise<OTPValidationResponse> {
  const response = await httpClient.post<ApiEnvelope<OTPValidationResponse>>(
    "/signup/finalize/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await httpClient.post<ApiEnvelope<LoginResponse>>("/login/", payload);
  return unwrapEnvelope(response);
}

export async function identityInit(payload: { email: string }): Promise<IdentityChallengePayload> {
  const response = await httpClient.post<ApiEnvelope<IdentityChallengePayload>>("/identity/init/", payload);
  return unwrapEnvelope(response);
}

export async function identityChallenge(payload: {
  hit: string;
  method: string;
  expected_step: number;
  password?: string;
  code?: string;
}): Promise<IdentityChallengePayload | OTPValidationResponse> {
  const response = await httpClient.post<ApiEnvelope<IdentityChallengePayload | OTPValidationResponse>>(
    "/identity/challenge/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function validateOtp(payload: {
  user_id: string;
  otp_code: string;
}): Promise<OTPValidationResponse> {
  const response = await httpClient.post<ApiEnvelope<OTPValidationResponse>>(
    "/otp-validate/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function signUpResend(payload: { email: string }): Promise<null> {
  const response = await httpClient.post<ApiEnvelope<null>>("/signup/resend/", payload);
  return unwrapEnvelope(response);
}

export async function resendOtp(payload: { user_id?: string; email?: string }): Promise<null> {
  const response = await httpClient.post<ApiEnvelope<null>>("/otp-resend/", payload);
  return unwrapEnvelope(response);
}

export async function refreshToken(payload: { refresh: string }): Promise<RefreshResponse> {
  const response = await httpClient.post<ApiEnvelope<RefreshResponse>>(
    "/token/refresh/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function requestPasswordReset(payload: {
  email?: string;
}): Promise<{ email: string; resend_interval: number }> {
  const response = await httpClient.post<
    ApiEnvelope<{ email: string; resend_interval: number }>
  >("/password-reset/request/", payload);
  return unwrapEnvelope(response);
}

export async function verifyPasswordResetOtp(payload: {
  email: string;
  otp_code: string;
}): Promise<{ reset_token: string }> {
  const response = await httpClient.post<ApiEnvelope<{ reset_token: string }>>(
    "/password-reset/verify/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function confirmPasswordReset(payload: {
  reset_token: string;
  password: string;
  confirm_password: string;
}): Promise<null> {
  const response = await httpClient.post<ApiEnvelope<null>>(
    "/password-reset/confirm/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function changePassword(payload: {
  old_password: string;
  password: string;
  confirm_password: string;
}): Promise<{ revoked_sessions: number }> {
  const response = await httpClient.post<ApiEnvelope<{ revoked_sessions: number }>>(
    "/password-change/",
    payload,
  );
  return unwrapEnvelope(response);
}

export async function verifyToken(payload: { token: string }): Promise<{ scope: string }> {
  const response = await httpClient.post<ApiEnvelope<{ scope: string }>>(
    "/token/verify/",
    payload,
  );
  return unwrapEnvelope(response);
}
