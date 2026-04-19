import { useSearchParams, Navigate } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { SignUpPage } from "./SignUpPage";
import { PasswordResetPage } from "./PasswordResetPage";
import { OtpPage } from "./OtpPage";
import { SessionGatePage } from "./SessionGatePage";
import { useAuthStore } from "../state/authState";

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "login";
  const authStatus = useAuthStore((state) => state.status);

  // Guard Logic within the Unified Page
  if (mode === "verify" && authStatus !== "pending_verification") {
    return <Navigate to="/auth?mode=login" replace />;
  }
  
  if (mode === "restricted" && authStatus !== "restricted") {
    return <Navigate to="/auth?mode=login" replace />;
  }

  if (authStatus === "full" && mode !== "restricted") {
    return <Navigate to="/settings" replace />;
  }

  // Component Mapping
  switch (mode) {
    case "signup":
    case "join":
      return <SignUpPage />;
    case "recovery":
    case "forgot-password":
      return <PasswordResetPage />;
    case "verify":
      return <OtpPage />;
    case "restricted":
    case "active-sessions":
      return <SessionGatePage />;
    case "login":
    default:
      return <LoginPage />;
  }
}
