import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { safeNextPath } from "../lib/safeNext";
import GoogleSignIn from "../components/GoogleSignIn";
import { passwordProblem, PASSWORD_HINT } from "../lib/passwordRules";
import AuthLayout, { AuthField } from "../components/auth/AuthLayout";

const BASE = "/api";

// Handoff 17d (Register) — kurallar alanın altında satır içi: şifre ipucu
// yazdıkça yeşile döner ya da kırmızı uyarıya; eşleşmeyen onay altında söylenir.
export default function Register() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [form, setForm] = useState({ email: "", username: "", password: "", confirm: "" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);
  // Zorunlu onay (mağaza UGC şartı): şartlar + Community Guidelines.
  const [agreed, setAgreed] = useState(false);

  const pwProblem = passwordProblem(form.password);
  const mismatch = form.confirm && form.password !== form.confirm;
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setTried(true);
    if (pwProblem || form.password !== form.confirm) return;
    if (!agreed) { setError("Agree to the Terms of Service and Community Guidelines to continue."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, username: form.username, password: form.password, accept_terms: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "The account wasn't created. Try again in a moment.");
      login(data.token, data.user);
      navigate(nextPath || (data.user.role === "admin" ? "/admin/articles" : "/profile"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const signin = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
  const pwShowErr = form.password && pwProblem && (tried || form.password.length > 18);

  return (
    <>
      <SEO title="Create account" description="Create your Primary Arch account." path="/register" noindex />
      <AuthLayout eyebrow="Join Primary Arch" title="Create your account" sub="Save rosters and squads, and climb the leaderboards."
        foot={<>Already have one? <Link to={signin}>Sign in</Link></>}>
        <form onSubmit={submit} className="au-form">
          <AuthField label="Email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
          <AuthField label="Username" required autoComplete="username" value={form.username} onChange={set("username")} />
          <AuthField label="Password" type="password" required autoComplete="new-password" value={form.password} onChange={set("password")}
            hint={PASSWORD_HINT} ok={!!form.password && !pwProblem} error={pwShowErr ? pwProblem : ""} />
          <AuthField label="Confirm password" type="password" required autoComplete="new-password" value={form.confirm} onChange={set("confirm")}
            error={mismatch && (tried || form.confirm.length >= form.password.length) ? "Passwords don't match" : ""} />

          <label className="au-check">
            <input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>
              I agree to the <Link to="/terms-of-service" target="_blank">Terms of Service</Link> and{" "}
              <Link to="/community-guidelines" target="_blank">Community Guidelines</Link>, including zero tolerance for abusive content.
            </span>
          </label>

          {error && <p className="au-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="pa-btn primary s54 block au-cta">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <GoogleSignIn successPath={nextPath} />
      </AuthLayout>
    </>
  );
}
