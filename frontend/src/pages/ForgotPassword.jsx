import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import AuthLayout, { AuthField } from "../components/auth/AuthLayout";

// Handoff 17d (Forgot). Hesabın var olup olmadığını söylemiyoruz — gönderildi
// ekranı her durumda aynı (e-posta avlamaya karşı).
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
      if (!res.ok) throw new Error(d.detail || "The link wasn't sent. Try again in a moment.");
      setSent(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <SEO title="Forgot password" path="/forgot-password" noindex />
      <AuthLayout title={sent ? "Check your inbox" : "Forgot your password?"}
        sub={sent ? null : "Enter your email and we'll send you a reset link."}
        foot={<>Remembered it? <Link to="/login">Back to sign in</Link></>}>
        {sent ? (
          <div className="au-sent" role="status">
            <b>If that email has an account, a reset link is on its way.</b>
            <span>Check your spam folder too. The link expires in 1 hour.</span>
          </div>
        ) : (
          <form onSubmit={submit} className="au-form">
            <AuthField label="Email" type="email" required autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
            {error && <p className="au-error" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="aura-rating-btn au-cta">{loading ? "Sending…" : "Send reset link"}</button>
          </form>
        )}
      </AuthLayout>
    </>
  );
}
