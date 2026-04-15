import { Navigate, createBrowserRouter } from "react-router-dom";

import { useAuthStore } from "@/features/auth/state";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { OtpPage } from "@/pages/OtpPage";
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

export const appRouter = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignUpPage /> },
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
]);
