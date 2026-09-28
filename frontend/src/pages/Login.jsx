import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { safeNextPath } from "../lib/safeNext";
import GoogleSignIn from "../components/GoogleSignIn";
import AuthLayout, { AuthField } from "../components/auth/AuthLayout";

const BASE = "/api";

// Handoff 10c / mobil 20g — ortalı form, kenarlıksız dolgulu alanlar.
export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const nextPath = safeNextPath(searchParams.get("next"));
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
      if (!res.ok) throw new Error(data.detail || "That email and password don't match an account.");
      login(data.token, data.user);
      navigate(nextPath || (data.user.role === "admin" ? "/admin/articles" : "/profile"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reg = nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register";

  return (
    <>
      <SEO title="Sign in" description="Sign in to your Primary Arch account." path="/login" noindex />
      <AuthLayout title="Sign in" sub="Save squads, land on the leaderboard, keep your rosters."
        foot={<>New here? <Link to={reg}>Create an account</Link></>}>
        {expired && <p className="au-note">Your session expired — sign back in to keep going.</p>}
        <form onSubmit={submit} className="au-form" noValidate={false}>
          <AuthField label="Email" type="email" required autoFocus autoComplete="email"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <AuthField label="Password" type="password" required autoComplete="current-password"
            aside={<Link to="/forgot-password">Forgot?</Link>}
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          {error && <p className="au-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="aura-rating-btn au-cta">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <GoogleSignIn successPath={nextPath} />
      </AuthLayout>
    </>
  );
}
