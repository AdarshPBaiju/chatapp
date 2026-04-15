import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { runLoginFlow } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      await runLoginFlow({ email, password });
      const status = useAuthStore.getState().status;
      if (status === "full") navigate("/dashboard");
      else if (status === "restricted") navigate("/session-gate");
      else if (status === "pending_verification") navigate("/otp");
    } catch (e) {
      setError(readApiMessage(e, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <Card>
        <h1>Login</h1>
        <form className="stack" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <FormError message={error} />
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <p>
          New account? <Link to="/signup">Create one</Link>
        </p>
      </Card>
    </main>
  );
}
