// Hesap silme — Primary Arch hesabı ve ona bağlı her şey (RankIt dahil).
// Google Play, hesap açılan uygulamalarda web'den de silme yolu istiyor: Play
// Console'daki "hesap silme bağlantısı" bu sayfa (/account/delete). Aynı işlem
// uygulamada RankIt → Profile → Settings içinde.
// Sunucu yeniden doğrulama ister: şifreli hesapta şifre, Google hesabında
// kullanıcı adı (api/main.py delete_own_account).
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

const inputStyle = { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" };

export default function AccountDelete() {
  const { token, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState("idle");   // idle | working | done
  const [error, setError] = useState("");

  // Silme bitince logout() oturumu kapatır; o an login'e atılmasın, onay görünsün.
  useEffect(() => {
    if (!isLoggedIn && state !== "done") navigate(`/login?next=${encodeURIComponent("/account/delete")}`, { replace: true });
  }, [isLoggedIn, navigate, state]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe(null));
  }, [isLoggedIn, token]);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setState("working");
    try {
      const body = me?.has_password ? { password: value } : { confirm: value };
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not delete the account");
      setState("done");
      logout();
    } catch (err) {
      setError(err.message); setState("idle");
    }
  };

  if (state === "done") return (
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <section className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Your account has been deleted</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Your profile and everything tied to it are gone. Thanks for being here.</p>
        <Link to="/" className="text-sm underline" style={{ color: "var(--text-muted)" }}>Back to Primary Arch</Link>
      </section>
    </div>
  );

  if (!isLoggedIn) return null;
  return (
    <>
    <SEO title="Delete account" description="Delete your Primary Arch account." path="/account/delete" noindex />
    <div className="h-full overflow-y-auto flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <section className="w-full max-w-md py-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Delete account</h1>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          {me ? <>Signed in as <strong style={{ color: "var(--text-primary)" }}>@{me.username}</strong>. </> : null}
          This permanently deletes your Primary Arch account and everything tied to it, in RankIt too:
        </p>
        <ul className="text-sm mb-4 list-disc pl-5 space-y-1" style={{ color: "var(--text-muted)" }}>
          <li>your profile, email address and password</li>
          <li>RankIt diary, ratings, reviews, comments, lists and follows</li>
          <li>game scores, saved players, lineups and rosters</li>
        </ul>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Articles you wrote stay published without your name. This can't be undone.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="delete-confirm" className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              {me?.has_password ? "Enter your password to confirm" : `Type your username${me ? ` (${me.username})` : ""} to confirm`}
            </label>
            <input id="delete-confirm" required autoComplete={me?.has_password ? "current-password" : "off"}
              type={me?.has_password ? "password" : "text"} value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          {error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" disabled={!me || !value || state === "working"}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--bg-elevated)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
            {state === "working" ? "Deleting…" : "Delete my account"}
          </button>
          <Link to="/profile" className="block text-center text-sm underline" style={{ color: "var(--text-muted)" }}>Keep my account</Link>
        </form>
      </section>
    </div>
    </>
  );
}
