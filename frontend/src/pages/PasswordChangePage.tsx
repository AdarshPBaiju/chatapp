import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword } from "@/features/auth/api";
import { readApiMessage } from "@/shared/lib/apiResponse";
import { Card } from "@/shared/ui/Card";
import { FormError } from "@/shared/ui/FormError";

export function PasswordChangePage() {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await changePassword({
        old_password: oldPassword,
        password,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(readApiMessage(err, "Failed to change password."));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="container">
        <Card>
          <h1>Password Changed</h1>
          <p>Your password has been updated successfully.</p>
          <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
        </Card>
      </main>
    );
  }

  return (
    <main className="container">
      <Card>
        <h1>Change Password</h1>
        <form className="stack" onSubmit={onSubmit}>
          <p>Enter your current password and choose a new one.</p>
          <input
            type="password"
            placeholder="Current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            disabled={loading}
          />
          <hr />
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
          />
          <FormError message={error} />
          <div className="row">
            <button type="button" className="secondary" onClick={() => navigate("/dashboard")}>
              Cancel
            </button>
            <button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </Card>
    </main>
  );
}
