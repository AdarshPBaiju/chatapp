import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/features/auth/state";
import { logoutFlow } from "@/features/sessions/flows";
import { Card } from "@/shared/ui/Card";

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  async function onLogout() {
    await logoutFlow();
    navigate("/login");
  }

  return (
    <main className="container">
      <Card>
        <h1>Dashboard</h1>
        <p>Authenticated as: {user?.email ?? "Unknown user"}</p>
        <div className="stack">
          <button type="button" className="secondary" onClick={() => navigate("/change-password")}>
            Change Password
          </button>
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </Card>
    </main>
  );
}
