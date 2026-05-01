import { AuthStatus } from "@/modules/auth/api/types";

export function canAccessFullRoutes(status: AuthStatus): boolean {
  return status === "full";
}

export function canAccessRestrictedRoutes(status: AuthStatus): boolean {
  return status === "restricted";
}

export function isGuest(status: AuthStatus): boolean {
  return status === "anonymous" || status === "pending_verification";
}
