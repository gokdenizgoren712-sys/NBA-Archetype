import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import { SEO } from "../hooks/useSEO";
import { Button, Field, Panel } from "../components/ui";
import "./settings.css";

// /settings (v3 Account Y1–Y4): Account · Security · Connections · Data & privacy.
// Yazma uçları henüz yok (ticket B1–B4, docs/BACKEND_TICKETS_UI_V3.md): kullanıcı adı/e-posta düzenleme,
// şifre değiştirme VITE_ACCOUNT_API=1 bayrağı arkasında çalışır; bayrak kapalıyken denetimler pasif ve nedeni yazılı.
// Google bağlantısını kesme, veri dışa aktarma ve Yahoo (ertelendi) için uç nokta adı uydurulmadı: pasif kalır.
const WRITE_API = import.meta.env?.VITE_ACCOUNT_API === "1";
const TABS = [["account", "Account"], ["security", "Security"], ["connections", "Connections"], ["data", "Data & privacy"]];

const maskEmail = (e = "") => { const [u, d] = e.split("@"); return d ? `${u.slice(0, 6)}${u.length > 6 ? "···" : ""}@${d}` : e; };
const since = (iso) => { const d = iso ? new Date(String(iso).replace(" ", "T") + (String(iso).includes("Z") ? "" : "Z")) : null; return d && !Number.isNaN(+d) ? d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null; };

function Row({ label, children, action }) {
  return (
    <div className="st-row">
      <div><span className="pa-eyebrow">{label}</span><div className="st-val">{children}</div></div>
      {action}
    </div>
  );
}

function AccountTab({ me, token, onSaved }) {
  const { lang, toggle } = useLang();
  const [name, setName] = useState(me.username);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const bad = !/^[A-Za-z0-9_]{3,24}$/.test(name);
  const dirty = name !== me.username;
  const save = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ username: name }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not save");
      onSaved(d);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Profile</p>
        <div className="st-id">
          <span className="st-av">{me.username?.[0]?.toUpperCase()}</span>
          <div><h2>{me.username}</h2>{since(me.created_at) && <p>Member since {since(me.created_at)}</p>}</div>
        </div>
        {WRITE_API ? (
          <>
            <Field label="Username" value={name} onChange={(e) => setName(e.target.value)}
              hint="3 to 24 characters. Letters, numbers, underscore."
              error={dirty && bad ? "3 to 24 characters. Letters, numbers, underscore." : err} />
            <div className="st-actions">
              <Button variant="primary" disabled={!dirty || bad || busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
              {dirty && <Button variant="quiet" onClick={() => { setName(me.username); setErr(""); }}>Cancel</Button>}
            </div>
          </>
        ) : (
          <Row label="Username">{me.username}</Row>
        )}
        <Row label="Email">
          {maskEmail(me.email)}<small>Used to sign in and to reset your password.</small>
        </Row>
      </Panel>
      <Panel pad>
        <p className="pa-eyebrow">Language</p>
        <Row label="Interface language" action={
          <div className="pa-tabs seg" role="group" aria-label="Language">
            {["en", "tr"].map((l) => <button key={l} type="button" className="pa-tab" aria-pressed={lang === l} onClick={() => lang !== l && toggle()}>{l.toUpperCase()}</button>)}
          </div>}>{" "}</Row>
      </Panel>
    </>
  );
}

function SecurityTab({ me, token, logout }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ cur: "", next: "", rep: "" });
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const mismatch = f.rep && f.next !== f.rep;
  const short = f.next && f.next.length < 6;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const update = async () => {
    setMsg({ type: "", text: "" }); setBusy(true);
    try {
      const r = await fetch("/api/account/change-password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ current_password: f.cur, new_password: f.next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not update the password");
      setF({ cur: "", next: "", rep: "" }); setMsg({ type: "ok", text: "Password updated." });
    } catch (e) { setMsg({ type: "err", text: e.message }); } finally { setBusy(false); }
  };
  const reset = async () => {
    setMsg({ type: "", text: "" });
    try {
      const r = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: me.email }) });
      setMsg(r.ok ? { type: "ok", text: "If that email has an account, a reset link is on its way." } : { type: "err", text: "The link wasn't sent. Try again in a moment." });
    } catch { setMsg({ type: "err", text: "The link wasn't sent. Try again in a moment." }); }
  };
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Password</p>
        {me.has_password ? (
          <>
            {WRITE_API ? (
              <>
                <Field label="Current password" type="password" autoComplete="current-password" value={f.cur} onChange={set("cur")} />
                <Field label="New password" type="password" autoComplete="new-password" value={f.next} onChange={set("next")}
                  hint="6 to 18 characters." error={short ? "6 to 18 characters." : ""} />
                <Field label="Repeat new password" type="password" autoComplete="new-password" value={f.rep} onChange={set("rep")}
                  error={mismatch ? "The two passwords don't match." : ""} />
                <div className="st-actions">
                  <Button variant="primary" disabled={busy || !f.cur || !f.next || short || mismatch || !f.rep} onClick={update}>{busy ? "Updating…" : "Update password"}</Button>
                  <button type="button" className="st-link" onClick={reset}>Forgot it? Send a reset link</button>
                </div>
              </>
            ) : (
              <div className="st-actions">
                <Button variant="outline" onClick={reset}>Send a password reset link</Button>
              </div>
            )}
          </>
        ) : (
          <p className="st-note">You sign in with Google, so there is no password to change.</p>
        )}
        {msg.text && <p className={`st-note ${msg.type}`} role="status">{msg.text}</p>}
      </Panel>
      <Panel pad>
        <p className="pa-eyebrow">This device</p>
        <Row label="Session" action={<Button variant="outline" onClick={() => { logout(); navigate("/"); }}>Sign out</Button>}>
          Signed in as {me.username}<small>You'll stay signed in on other devices.</small>
        </Row>
      </Panel>
    </>
  );
}

function ConnectionsTab({ me }) {
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Sign-in</p>
        <Row label="Google">
          {me.has_password ? "Email and password" : "Signed in with Google"}
        </Row>
      </Panel>
      <Panel pad>
        <p className="pa-eyebrow">RankIt</p>
        <Row label="RankIt" action={<Button as={Link} to="/rankit" variant="quiet">Open RankIt</Button>}>
          Same account<small>Your diary, ratings and lists live there.</small>
        </Row>
      </Panel>
    </>
  );
}

function DataTab({ me }) {
  const navigate = useNavigate();
  const legal = [["Terms of service", "/terms-of-service"], ["Privacy policy", "/privacy-policy"], ["Community guidelines", "/community-guidelines"]];
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Legal</p>
        {legal.map(([l, to], i) => (
          <Row key={to} label={l} action={<Button as={Link} to={to} variant="quiet">View</Button>}>
            {i === 0 ? (me.terms_current ? "Current version accepted" : "A newer version is waiting for you") : <>{" "}</>}
          </Row>
        ))}
      </Panel>
      <Panel pad className="st-danger">
        <p className="pa-eyebrow">Danger zone</p>
        <Row label="Delete account" action={<Button variant="outline" className="st-del" onClick={() => navigate("/account/delete")}>Delete account</Button>}>
          Permanently removes your account and everything tied to it, RankIt included. This can't be undone.
        </Row>
      </Panel>
    </>
  );
}

export default function Settings() {
  const { token, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "account";
  const [me, setMe] = useState(null);

  useEffect(() => { if (!isLoggedIn) navigate(`/login?next=${encodeURIComponent("/settings")}`, { replace: true }); }, [isLoggedIn, navigate]);
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe(null));
  }, [isLoggedIn, token]);

  if (!isLoggedIn) return null;
  return (
    <div className="st-page">
      <SEO title="Settings" description="Manage your Primary Arch account." path="/settings" noindex />
      <header><p className="pa-eyebrow">Account</p><h1 className="pa-h1">Settings</h1></header>
      <div className="st-grid">
        <nav className="st-nav" aria-label="Settings sections">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>
          ))}
        </nav>
        <div className="st-body">
          {!me ? <Panel pad><p className="st-note">Loading…</p></Panel>
            : tab === "account" ? <AccountTab me={me} token={token} onSaved={(d) => setMe((m) => ({ ...m, ...d }))} />
            : tab === "security" ? <SecurityTab me={me} token={token} logout={logout} />
            : tab === "connections" ? <ConnectionsTab me={me} />
            : <DataTab me={me} />}
        </div>
      </div>
    </div>
  );
}
