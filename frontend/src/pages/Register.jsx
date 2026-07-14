import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import GoogleSignIn from "../components/GoogleSignIn";

const BASE = "/api";

export default function Register() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm] = useState({
    email: "", username: "", password: "", confirm: "", admin_invite_code: ""
  });
  const [showAdminField, setShowAdminField] = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          username: form.username,
          password: form.password,
          admin_invite_code: form.admin_invite_code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      login(data.token, data.user);
      navigate(data.user.role === "admin" ? "/admin/articles" : "/profile");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const field = (label, key, type = "text") => (
    <div>
      <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
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
          {field("Password", "password", "password")}
          {field("Confirm Password", "confirm", "password")}

          {showAdminField ? (
            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                Admin Invite Code
              </label>
              <input
                type="text"
                value={form.admin_invite_code}
                onChange={e => setForm(f => ({ ...f, admin_invite_code: e.target.value }))}
                placeholder="Leave blank if you don't have one"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowAdminField(true)}
              className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              I have an admin invite code
            </button>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl font-logo font-bold text-sm uppercase tracking-wide transition-colors bg-yamabuki text-darkBg hover:bg-white disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>

        <GoogleSignIn />

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </div>
    </div>
    </>
  );
}
