import { Navigate, createBrowserRouter } from "react-router-dom";

import { useAuthStore } from "@/modules/auth/state/authState";
import { AuthPage } from "@/modules/auth/pages/AuthPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { AuthShell } from "@/shared/ui/AuthShell";

// Features ui components for nested routing
import { ProfileSection } from "@/features/settings/ui/ProfileSection";
import { SecuritySection } from "@/features/settings/ui/SecuritySection";
import { ActiveSessionsSection } from "@/features/settings/ui/ActiveSessionsSection";

function RootRedirect() {
  const status = useAuthStore((state) => state.status);

  if (status === "full") return <Navigate to="/settings" replace />;
  if (status === "restricted") return <Navigate to="/auth?mode=restricted" replace />;
  if (status === "pending_verification") return <Navigate to="/auth?mode=verify" replace />;
  return <Navigate to="/auth?mode=login" replace />;
}

function FullAuthGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "restricted") return <Navigate to="/auth?mode=restricted" replace />;
  if (status !== "full") {
    return <Navigate to="/auth?mode=login" replace />;
  }
  return children;
}

export const appRouter = createBrowserRouter([
  { 
    path: "/", 
    element: <RootRedirect />,
    errorElement: <ErrorPage />,
  },
  { path: "/app", element: <Navigate to="/settings" replace /> },
  { path: "/account", element: <Navigate to="/settings" replace /> },
  {
    element: <AuthShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/auth", element: <AuthPage /> },
      // Support legacy paths by redirecting to params
      { path: "/auth/login", element: <Navigate to="/auth?mode=login" replace /> },
      { path: "/auth/join", element: <Navigate to="/auth?mode=signup" replace /> },
      { path: "/auth/verify", element: <Navigate to="/auth?mode=verify" replace /> },
      { path: "/auth/forgot-password", element: <Navigate to="/auth?mode=recovery" replace /> },
      { path: "/auth/active-sessions", element: <Navigate to="/auth?mode=restricted" replace /> },
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
      { path: "notifications", element: <div className="p-20 text-center font-bold text-muted-foreground/30 uppercase tracking-widest text-xs">Access Restricted • Coming Soon</div> },
      { index: true, element: null },
    ],
  },
]);
