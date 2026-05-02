import { Navigate, createBrowserRouter } from "react-router-dom";

import { AuthPage } from "@/modules/auth/pages/AuthPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { AuthShell } from "@/shared/ui/AuthShell";

// Features ui components for nested routing
import { ProfileSection } from "@/features/settings/ui/ProfileSection";
import { PrivacySection } from "@/features/settings/ui/PrivacySection";
import { SecuritySection } from "@/features/settings/ui/SecuritySection";
import { ActiveSessionsSection } from "@/features/settings/ui/ActiveSessionsSection";

import { 
  AuthenticatedGuard, 
  GuestGuard, 
  RootRedirect 
} from "@/shared/auth/guards";

export const appRouter = createBrowserRouter([
  { 
    path: "/", 
    element: <RootRedirect />,
    errorElement: <ErrorPage />,
  },
  { path: "/app", element: <Navigate to="/settings" replace /> },
  { path: "/account", element: <Navigate to="/settings" replace /> },
  {
    element: (
      <GuestGuard>
        <AuthShell />
      </GuestGuard>
    ),
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
      <AuthenticatedGuard>
        <SettingsPage />
      </AuthenticatedGuard>
    ),
    children: [
      { path: "profile", element: <ProfileSection /> },
      { path: "privacy", element: <PrivacySection /> },
      { path: "security", element: <SecuritySection /> },
      { path: "devices", element: <ActiveSessionsSection /> },
      { path: "notifications", element: <div className="p-20 text-center font-bold text-muted-foreground/30 uppercase tracking-widest text-xs">Access Restricted • Coming Soon</div> },
      { index: true, element: null },
    ],
  },
]);
