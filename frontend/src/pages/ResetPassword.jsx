import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { passwordProblem, PASSWORD_HINT } from "../lib/passwordRules";
import AuthLayout, { AuthField } from "../components/auth/AuthLayout";

// Handoff 17d (Reset) — ipucu ve eşleşme hatası alanların altında.
export default function ResetPassword() {
  const [params]    = useSearchParams();
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const resetToken  = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [tried, setTried]       = useState(false);

  const pwProblem = passwordProblem(password);
  const mismatch = confirm && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setTried(true); setError("");
    if (pwProblem || password !== confirm) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "The password wasn't changed. The link may have expired.");
      login(d.token, d.user);
      navigate("/profile");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!resetToken) return (
    <AuthLayout eyebrow="Account recovery" title="This link doesn't work" sub="The reset link is missing or incomplete. Request a new one and use the link from the latest email."
      foot={<Link to="/login">Back to sign in</Link>}>
      <Link to="/forgot-password" className="pa-btn primary s54 block au-cta" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>Request a new link</Link>
    </AuthLayout>
  );

  return (
    <>
      <SEO title="Set a new password" path="/reset-password" noindex />
      <AuthLayout eyebrow="Account recovery" title="Set a new password" sub="Choose a password you haven't used here before."
        foot={<Link to="/login">Back to sign in</Link>}>
        <form onSubmit={submit} className="au-form">
          <AuthField label="New password" type="password" required autoFocus autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)}
            hint={PASSWORD_HINT} ok={!!password && !pwProblem} error={password && pwProblem && (tried || password.length > 18) ? pwProblem : ""} />
          <AuthField label="Confirm password" type="password" required autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            error={mismatch && (tried || confirm.length >= password.length) ? "Passwords don't match" : ""} />
          {error && <p className="au-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="pa-btn primary s54 block au-cta">{loading ? "Saving…" : "Save password"}</button>
        </form>
      </AuthLayout>
    </>
  );
}
