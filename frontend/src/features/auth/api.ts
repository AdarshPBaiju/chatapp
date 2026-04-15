import { httpClient } from "@/shared/http/client";
import { unwrapEnvelope } from "@/shared/lib/apiResponse";
import { ApiEnvelope } from "@/shared/types/api";
import {
  LoginRequest,
  LoginResponse,
  RestrictedAuthPayload,
  SignUpRequest,
  UserInfo,
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
  user: UserInfo;
};

export type RefreshResponse =
  | RestrictedAuthPayload
  | {
      is_restricted: false;
      access: string;
      refresh: string;
    };

export async function signUp(payload: SignUpRequest): Promise<SignUpResponse> {
  const response = await httpClient.post<ApiEnvelope<SignUpResponse>>("/signup/", payload);
  return unwrapEnvelope(response);
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await httpClient.post<ApiEnvelope<LoginResponse>>("/login/", payload);
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

export async function resendOtp(payload: { user_id: string }): Promise<unknown> {
  const response = await httpClient.post<ApiEnvelope<unknown>>("/otp-resend/", payload);
  return unwrapEnvelope(response);
}

export async function refreshToken(payload: { refresh: string }): Promise<RefreshResponse> {
  const response = await httpClient.post<ApiEnvelope<RefreshResponse>>(
    "/token/refresh/",
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
