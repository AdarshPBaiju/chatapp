import { AxiosError } from "axios";
import { ApiEnvelope } from "@/shared/types/api";

/**
 * Extracts a user-friendly error message from a backend ApiEnvelope response.
 * Follows the standard response structure: { success: false, message: "...", error_code: "..." }
 */
export function getErrorMessage(error: unknown, fallback = "An unexpected error occurred."): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiEnvelope<null> | undefined;
    
    // 1. Try to get the detailed 'message' from our standard envelope
    if (data?.message) {
      return data.message;
    }

    // 2. Fallback to axios error message or status text
    if (error.response?.status === 404 && !data) {
       return "The requested resource was not found.";
    }

    if (error.response?.statusText) {
      return error.response.statusText;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
