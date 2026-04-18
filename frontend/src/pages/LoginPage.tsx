import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";

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

  const footer = (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">New to ChitChat?</span>
      <Link to="/signup" className="font-medium text-sky-700 transition-colors hover:text-sky-800">
        Create an account
      </Link>
    </span>
  );

  return (
    <AuthLayout
      heading="Sign in"
      subheading="Use your email address and password to access your workspace."
      footer={footer}
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <Input
          type="email"
          label="Email Address"
          placeholder="name@company.com"
          icon={<Mail size={20} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />

        <div className="space-y-4">
          <Input
            type="password"
            label="Password"
            placeholder="Enter your password"
            icon={<Lock size={20} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            error={error}
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-sky-700 transition-colors hover:text-sky-800"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-6 pt-2">
          <Button type="submit" className="w-full py-4" isLoading={loading}>
            Sign in
          </Button>

          {/* Social login section intentionally commented out until provider authentication is implemented.
          <div className="grid grid-cols-2 gap-4">
            <Button variant="social">Google</Button>
            <Button variant="social">Github</Button>
          </div>
          */}
        </div>
      </form>
    </AuthLayout >
  );
}
