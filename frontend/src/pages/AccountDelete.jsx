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
import { Button, Field, Panel } from "../components/ui";
import "./settings.css";

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
    <div className="ad-gone pa-grid">
      <section>
        <p className="pa-eyebrow">Account deleted</p>
        <h1 className="pa-h1">Your account<br />is gone</h1>
        <p className="pa-sys-body" style={{ textAlign: "center" }}>Your profile and everything tied to it were removed. Thanks for being here.</p>
        <Button as={Link} to="/" variant="outline">Back to Primary Arch</Button>
      </section>
    </div>
  );

  if (!isLoggedIn) return null;
  return (
    <>
    <SEO title="Delete account" description="Delete your Primary Arch account." path="/account/delete" noindex />
    <div className="ad-page">
      <Panel pad className="ad-card">
        <h1 className="ad-h1">Delete account</h1>
        <p>
          {me ? <>Signed in as <strong>@{me.username}</strong>. </> : null}
          This permanently deletes your Primary Arch account and everything tied to it, in RankIt too:
        </p>
        <ul>
          <li>your profile, email address and password</li>
          <li>RankIt diary, ratings, reviews, comments, lists and follows</li>
          <li>game scores, saved players, lineups and rosters</li>
        </ul>
        <p>Articles you wrote stay published without your name. This can't be undone.</p>
        <form onSubmit={submit}>
          <Field label={me?.has_password ? "Enter your password to confirm" : `Type your username${me ? ` (${me.username})` : ""} to confirm`}
            required autoComplete={me?.has_password ? "current-password" : "off"} type={me?.has_password ? "password" : "text"}
            value={value} onChange={(e) => setValue(e.target.value)} error={error} />
          <Button type="submit" variant="outline" size={54} block className="ad-del" disabled={!me || !value || state === "working"}>
            {state === "working" ? "Deleting…" : "Delete my account"}
          </Button>
          <Link to="/settings?tab=data" className="ad-keep">Keep my account</Link>
        </form>
      </Panel>
    </div>
    </>
  );
}
