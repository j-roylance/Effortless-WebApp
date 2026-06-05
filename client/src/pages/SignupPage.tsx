import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      navigate("/welcome");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="logo" style={{ color: "var(--cyan)", marginBottom: "2rem" }}>
        Effortless
      </h1>
      <form className="auth-form neon-card" onSubmit={handleSubmit}>
        <h2 style={{ margin: 0, fontSize: "0.9rem" }}>Sign up</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="neon-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password (min 8)</label>
          <input
            id="password"
            type="password"
            className="neon-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="form-field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            className="neon-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="neon-btn neon-btn-magenta" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          Have an account?{" "}
          <Link to="/login" style={{ color: "var(--cyan)" }}>
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
