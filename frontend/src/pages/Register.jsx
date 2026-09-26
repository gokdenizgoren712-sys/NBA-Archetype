import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { safeNextPath } from "../lib/safeNext";
import GoogleSignIn from "../components/GoogleSignIn";
import { passwordProblem, PASSWORD_HINT } from "../lib/passwordRules";

const BASE = "/api";

export default function Register() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [form, setForm] = useState({
    email: "", username: "", password: "", confirm: ""
  });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  // Zorunlu onay (mağaza UGC şartı): şartlar + Community Guidelines.
  const [agreed, setAgreed] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!agreed) { setError("Agree to the Terms of Service and Community Guidelines to continue"); return; }
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    const pwProblem = passwordProblem(form.password);
    if (pwProblem) { setError(pwProblem); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          username: form.username,
          password: form.password,
          accept_terms: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      login(data.token, data.user);
      navigate(nextPath || (data.user.role === "admin" ? "/admin/articles" : "/profile"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const field = (label, key, type = "text", hint = "") => (
    <div>
      <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
        {label}{hint && <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>· {hint}</span>}
      </label>
      <input
        type={type} required
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      />
    </div>
  );

  return (
    <>
    <SEO title="Sign Up" description="Create your Primary Arch account." path="/register" noindex />
    <div className="h-full overflow-y-auto flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm py-8">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Create Account
        </h1>

        <form onSubmit={submit} className="space-y-4">
          {field("Email", "email", "email")}
          {field("Username", "username")}
          {field("Password", "password", "password", PASSWORD_HINT)}
          {field("Confirm Password", "confirm", "password")}

          <label className="flex items-start gap-2.5 text-sm leading-snug cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: "var(--yamabuki)" }} />
            <span>
              I agree to the{" "}
              <Link to="/terms-of-service" target="_blank" className="underline" style={{ color: "var(--text-primary)" }}>Terms of Service</Link>{" "}
              and{" "}
              <Link to="/community-guidelines" target="_blank" className="underline" style={{ color: "var(--text-primary)" }}>Community Guidelines</Link>,
              including zero tolerance for abusive content.
            </span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl font-logo font-bold text-sm uppercase tracking-wide transition-colors bg-yamabuki text-darkBg hover:bg-white disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>

        <GoogleSignIn successPath={nextPath} />

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <Link to={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </div>
    </div>
    </>
  );
}
