import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      navigate("/");
    } catch {
      setError("Invalid credentials");
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
        <h2 style={{ margin: 0, fontSize: "0.9rem" }}>Login</h2>
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="neon-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="neon-btn neon-btn-primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>
          No account?{" "}
          <Link to="/signup" style={{ color: "var(--cyan)" }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
