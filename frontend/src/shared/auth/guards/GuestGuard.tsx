import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/modules/auth/state/authState";
import { ErrorPage } from "@/pages/ErrorPage";

interface GuardProps {
  children: ReactNode;
}

export function GuestGuard({ children }: GuardProps) {
  const status = useAuthStore((state) => state.status);

  if (status === "offline") return <ErrorPage mode="offline" />;
  if (status === "full") return <Navigate to="/settings" replace />;
  if (status === "restricted") return <Navigate to="/auth?mode=restricted" replace />;
  
  return <>{children}</>;
}
