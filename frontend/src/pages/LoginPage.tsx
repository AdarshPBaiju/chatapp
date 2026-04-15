import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { runLoginFlow } from "@/features/auth/flows";
import { useAuthStore } from "@/features/auth/state";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { Button, Input } from "@/shared/ui/FormControls";

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

  const subheading = (
    <span>
      Don't have an account?{" "}
      <Link to="/signup" className="text-[var(--color-primary)] hover:underline font-medium">
        Create one
      </Link>
    </span>
  );

  return (
    <AuthLayout heading="Welcome back" subheading={subheading}>
      <form onSubmit={onSubmit} className="space-y-6">
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />

        <div className="space-y-1">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            error={error}
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-[var(--muted)] hover:text-white transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" isLoading={loading}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
