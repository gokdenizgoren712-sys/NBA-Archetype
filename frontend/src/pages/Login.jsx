import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

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
      if (!res.ok) throw new Error(data.detail || "Giriş başarısız");
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
    <SEO title="Giriş Yap" description="NBA Archetype hesabına giriş yap." path="/login" noindex />
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Giriş Yap
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
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Şifre</label>
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
            {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          Hesabın yok mu?{" "}
          <Link to="/register" style={{ color: "var(--accent)" }}>Kayıt ol</Link>
        </p>
      </div>
    </div>
    </>
  );
}
