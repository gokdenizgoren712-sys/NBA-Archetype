import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

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
    if (form.password !== form.confirm) { setError("Şifreler eşleşmiyor"); return; }
    if (form.password.length < 6) { setError("Şifre en az 6 karakter olmalı"); return; }
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
      if (!res.ok) throw new Error(data.detail || "Kayıt başarısız");
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
        className="w-full px-3 py-2 rounded text-sm outline-none"
        style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      />
    </div>
  );

  return (
    <>
    <SEO title="Kayıt Ol" description="NBA Archetype için hesap oluştur." path="/register" noindex />
    <div className="h-full overflow-y-auto flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm py-8">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Kayıt Ol
        </h1>

        <form onSubmit={submit} className="space-y-4">
          {field("Email", "email", "email")}
          {field("Kullanıcı Adı", "username")}
          {field("Şifre", "password", "password")}
          {field("Şifre (Tekrar)", "confirm", "password")}

          {showAdminField ? (
            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                Admin Davet Kodu
              </label>
              <input
                type="text"
                value={form.admin_invite_code}
                onChange={e => setForm(f => ({ ...f, admin_invite_code: e.target.value }))}
                placeholder="Kod yoksa boş bırak"
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowAdminField(true)}
              className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              Admin hesabı oluşturmak istiyorum
            </button>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-2 rounded text-sm font-semibold transition-opacity"
            style={{ background: "var(--accent)", color: "#000", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Kaydediliyor…" : "Kayıt Ol"}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          Zaten hesabın var mı?{" "}
          <Link to="/login" style={{ color: "var(--accent)" }}>Giriş yap</Link>
        </p>
      </div>
    </div>
    </>
  );
}
