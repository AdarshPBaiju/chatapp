import { RouterProvider } from "react-router-dom";

import { appRouter } from "@/app/router";
import { useAuthBootstrap } from "@/app/bootstrap";
import { PropsWithChildren, createContext, useContext } from "react";
import { useAuthStore } from "@/features/auth/state";
import { ThemeProvider } from "@/shared/ui/ThemeProvider";
import { ThemeSwitcher } from "@/shared/ui/ThemeSwitcher";

import { LoadingScreen } from "@/shared/ui/LoadingScreen";
import { Toaster } from "@/shared/ui/Toast";

interface AuthContextValue {
  status: string;
  user: any;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AppProviders");
  return context;
}

export function AppProviders({ children }: PropsWithChildren) {
  const auth = useAuthStore();

  const value: AuthContextValue = {
    status: auth.status,
    user: auth.user,
    isAuthenticated: auth.status === "full",
  };

  return (
    <ThemeProvider defaultTheme="light" storageKey="chatapp-theme">
      <AuthContext.Provider value={value}>
        <div className="app-root min-h-screen">
          {children}
          <ThemeSwitcher />
          <Toaster />
        </div>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

export function App() {
  const ready = useAuthBootstrap();

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <AppProviders>
      <RouterProvider router={appRouter} />
    </AppProviders>
  );
}
