import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

export default function ResetPassword() {
  const [params]    = useSearchParams();
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const resetToken  = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Error");
      login(d.token, d.user);
      navigate("/profile");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!resetToken) return (
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="text-center space-y-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Invalid or missing reset link.</p>
        <Link to="/forgot-password" style={{ color: "var(--accent)" }} className="text-sm block">
          Request a new one →
        </Link>
      </div>
    </div>
  );

  return (
    <>
    <SEO title="Reset Password" path="/reset-password" noindex />
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Reset Password
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>New Password</label>
            <input
              type="password" required autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Confirm Password</label>
            <input
              type="password" required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl font-logo font-bold text-sm uppercase tracking-wide transition-colors bg-yamabuki text-darkBg hover:bg-white disabled:opacity-50">
            {loading ? "Resetting…" : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
    </>
  );
}
