import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { MailIcon } from "../components/BrandIcons";

export default function ForgotPassword() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Error");
      setSent(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
    <SEO title="Forgot Password" path="/forgot-password" noindex />
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "var(--text-primary)" }}>
          Forgot Password
        </h1>
        <p className="text-sm text-center mb-6" style={{ color: "var(--text-muted)" }}>
          Enter your email and we'll send a reset link.
        </p>

        {sent ? (
          <div className="text-center space-y-4 p-6 rounded-xl"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="flex justify-center text-asagi"><MailIcon size={32} /></div>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              If that email is registered, a reset link has been sent.
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Check your inbox (and spam folder). The link expires in 1 hour.
            </p>
            <Link to="/login" className="text-sm block mt-2" style={{ color: "var(--accent)" }}>
              ← Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
              <input
                type="email" required autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl font-logo font-bold text-sm uppercase tracking-wide transition-colors bg-yamabuki text-darkBg hover:bg-white disabled:opacity-50">
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
              <Link to="/login" style={{ color: "var(--accent)" }}>← Back to Login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
    </>
  );
}
