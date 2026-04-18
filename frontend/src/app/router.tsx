import { Navigate, createBrowserRouter } from "react-router-dom";

import { useAuthStore } from "@/features/auth/state";
import { LoginPage } from "@/pages/LoginPage";
import { OtpPage } from "@/pages/OtpPage";
import { PasswordResetPage } from "@/pages/PasswordResetPage";
import { SessionGatePage } from "@/pages/SessionGatePage";
import { SignUpPage } from "@/pages/SignUpPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { AuthShell } from "@/shared/ui/AuthShell";

// Features ui components for nested routing
import { ProfileSection } from "@/features/settings/ui/ProfileSection";
import { SecuritySection } from "@/features/settings/ui/SecuritySection";
import { ActiveSessionsSection } from "@/features/settings/ui/ActiveSessionsSection";

function RootRedirect() {
  const status = useAuthStore((state) => state.status);

  if (status === "full") return <Navigate to="/settings/profile" replace />;
  if (status === "restricted") return <Navigate to="/auth/active-sessions" replace />;
  if (status === "pending_verification") return <Navigate to="/auth/verify" replace />;
  return <Navigate to="/auth/login" replace />;
}

function FullAuthGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "restricted") return <Navigate to="/auth/active-sessions" replace />;
  if (status !== "full") {
    return <Navigate to="/auth/login" replace />;
  }
  return children;
}

function RestrictedGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "full") return <Navigate to="/settings/profile" replace />;
  if (status !== "restricted") {
    return <Navigate to="/auth/login" replace />;
  }
  return children;
}

function OtpGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status !== "pending_verification") {
    return <Navigate to="/auth/login" replace />;
  }
  return children;
}

function PublicGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "full") return <Navigate to="/settings/profile" replace />;
  if (status === "restricted") return <Navigate to="/auth/active-sessions" replace />;
  if (status === "pending_verification") return <Navigate to="/auth/verify" replace />;
  return children;
}

export const appRouter = createBrowserRouter([
  { 
    path: "/", 
    element: <RootRedirect />,
    errorElement: <ErrorPage />,
  },
  { path: "/dashboard", element: <Navigate to="/settings/profile" replace /> },
  { path: "/app", element: <Navigate to="/settings/profile" replace /> },
  { path: "/account", element: <Navigate to="/settings/profile" replace /> },
  {
    element: <AuthShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/auth/login", element: <PublicGuard><LoginPage /></PublicGuard> },
      { path: "/auth/join", element: <PublicGuard><SignUpPage /></PublicGuard> },
      { path: "/auth/reset-password", element: <PublicGuard><PasswordResetPage /></PublicGuard> },
      {
        path: "/auth/verify",
        element: (
          <OtpGuard>
            <OtpPage />
          </OtpGuard>
        ),
      },
      {
        path: "/auth/active-sessions",
        element: (
          <RestrictedGuard>
            <SessionGatePage />
          </RestrictedGuard>
        ),
      },
    ],
  },
  {
    path: "/settings",
    errorElement: <ErrorPage />,
    element: (
      <FullAuthGuard>
        <SettingsPage />
      </FullAuthGuard>
    ),
    children: [
      { path: "profile", element: <ProfileSection /> },
      { path: "security", element: <SecuritySection /> },
      { path: "devices", element: <ActiveSessionsSection /> },
      { path: "notifications", element: <div className="p-20 text-center font-bold text-slate-300 uppercase tracking-widest text-xs">Access Restricted • Coming Soon</div> },
      { path: "", element: <Navigate to="profile" replace /> },
    ],
  },
]);
