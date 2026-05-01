import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/modules/auth/state/authState";
import { ErrorPage } from "@/pages/ErrorPage";

interface GuardProps {
  children: ReactNode;
}

export function AuthenticatedGuard({ children }: GuardProps) {
  const status = useAuthStore((state) => state.status);

  if (status === "offline") return <ErrorPage mode="offline" />;
  if (status === "restricted") return <Navigate to="/auth?mode=restricted" replace />;
  if (status !== "full") {
    return <Navigate to="/auth?mode=login" replace />;
  }
  return <>{children}</>;
}
