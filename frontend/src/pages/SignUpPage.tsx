import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { runSignUpFlow } from "@/features/auth/flows";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

export function SignUpPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await runSignUpFlow({
        full_name: fullName,
        email,
        password,
        confirm_password: confirmPassword,
      });
      navigate("/otp");
    } catch (e) {
      setError(readApiMessage(e, "Sign up failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <Card>
        <h1>Create Account</h1>
        <form className="stack" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <FormError message={error} />
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        <p>
          Already registered? <Link to="/login">Login</Link>
        </p>
      </Card>
    </main>
  );
}
