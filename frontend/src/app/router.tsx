import { Navigate, createBrowserRouter } from "react-router-dom";

import { useAuthStore } from "@/features/auth/state";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { OtpPage } from "@/pages/OtpPage";
import { PasswordChangePage } from "@/pages/PasswordChangePage";
import { PasswordResetPage } from "@/pages/PasswordResetPage";
import { SessionGatePage } from "@/pages/SessionGatePage";
import { SignUpPage } from "@/pages/SignUpPage";

function RootRedirect() {
  const status = useAuthStore((state) => state.status);

  if (status === "full") return <Navigate to="/dashboard" replace />;
  if (status === "restricted") return <Navigate to="/session-gate" replace />;
  if (status === "pending_verification") return <Navigate to="/otp" replace />;
  return <Navigate to="/login" replace />;
}

function FullAuthGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "restricted") return <Navigate to="/session-gate" replace />;
  if (status !== "full") {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RestrictedGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "full") return <Navigate to="/dashboard" replace />;
  if (status !== "restricted") {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function OtpGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status !== "pending_verification") {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicGuard({ children }: { children: JSX.Element }) {
  const status = useAuthStore((state) => state.status);
  if (status === "full") return <Navigate to="/dashboard" replace />;
  if (status === "restricted") return <Navigate to="/session-gate" replace />;
  if (status === "pending_verification") return <Navigate to="/otp" replace />;
  return children;
}

export const appRouter = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <PublicGuard><LoginPage /></PublicGuard> },
  { path: "/signup", element: <PublicGuard><SignUpPage /></PublicGuard> },
  { path: "/forgot-password", element: <PublicGuard><PasswordResetPage /></PublicGuard> },
  {
    path: "/otp",
    element: (
      <OtpGuard>
        <OtpPage />
      </OtpGuard>
    ),
  },
  {
    path: "/session-gate",
    element: (
      <RestrictedGuard>
        <SessionGatePage />
      </RestrictedGuard>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <FullAuthGuard>
        <DashboardPage />
      </FullAuthGuard>
    ),
  },
  {
    path: "/change-password",
    element: (
      <FullAuthGuard>
        <PasswordChangePage />
      </FullAuthGuard>
    ),
  },
]);
