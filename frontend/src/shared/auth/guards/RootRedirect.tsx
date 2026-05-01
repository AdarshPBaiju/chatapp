import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/modules/auth/state/authState";
import { ErrorPage } from "@/pages/ErrorPage";

export function RootRedirect() {
  const status = useAuthStore((state) => state.status);

  if (status === "offline") return <ErrorPage mode="offline" />;
  if (status === "full") return <Navigate to="/settings" replace />;
  if (status === "restricted") return <Navigate to="/auth?mode=restricted" replace />;
  if (status === "pending_verification") return <Navigate to="/auth?mode=verify" replace />;
  return <Navigate to="/auth?mode=login" replace />;
}
