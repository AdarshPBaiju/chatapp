import { AxiosResponse } from "axios";

import { ApiEnvelope } from "@/shared/types/api";

export function unwrapEnvelope<T>(response: AxiosResponse<ApiEnvelope<T>>): T {
  const body = response.data;
  if (!body || body.success !== true) {
    throw new Error(body?.message ?? "Unexpected API response shape.");
  }
  return body.data as T;
}

export function readApiMessage(error: unknown, fallback = "Request failed."): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function readApiErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error_code?: string } } }).response;
    return response?.data?.error_code ?? null;
  }
  return null;
}
