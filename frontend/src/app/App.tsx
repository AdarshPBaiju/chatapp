import { RouterProvider } from "react-router-dom";

import { appRouter } from "@/app/router";
import { useAuthBootstrap } from "@/app/bootstrap";
import { PropsWithChildren, createContext, useContext } from "react";
import { useAuthStore } from "@/features/auth/state";

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
    <AuthContext.Provider value={value}>
      <div className="app-root">
        {children}
      </div>
    </AuthContext.Provider>
  );
}

export function App() {
  const ready = useAuthBootstrap();

  if (!ready) {
    return <div className="container center" style={{ height: '100vh' }}><p>Initializing encryption & sessions...</p></div>;
  }

  return (
    <AppProviders>
      <RouterProvider router={appRouter} />
    </AppProviders>
  );
}
