import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import GoogleSignIn from "../components/GoogleSignIn";

const BASE = "/api";

export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");
      login(data.token, data.user);
      navigate(data.user.role === "admin" ? "/admin/articles" : "/profile");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <SEO title="Log In" description="Log in to your NBA Archetype account." path="/login" noindex />
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Log In
        </h1>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
            <input
              type="email" required autoFocus
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm" style={{ color: "var(--text-muted)" }}>Password</label>
              <Link to="/forgot-password" className="text-xs" style={{ color: "var(--accent)" }}>
                Forgot password?
              </Link>
            </div>
            <input
              type="password" required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-2 rounded text-sm font-semibold transition-opacity"
            style={{ background: "var(--accent)", color: "#000", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>

        <GoogleSignIn />

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ color: "var(--accent)" }}>Sign up</Link>
        </p>
      </div>
    </div>
    </>
  );
}
