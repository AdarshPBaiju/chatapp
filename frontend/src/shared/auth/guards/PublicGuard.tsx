import { ReactNode } from "react";

interface GuardProps {
  children: ReactNode;
}

export function PublicGuard({ children }: GuardProps) {
  // Public routes allow both authenticated and guest users.
  // Can be used to inject global banners (like offline warnings) if needed.
  return <>{children}</>;
}
