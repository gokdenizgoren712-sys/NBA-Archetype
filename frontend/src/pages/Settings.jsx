import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import { SEO } from "../hooks/useSEO";
import { Button, Field, Panel } from "../components/ui";
import "./settings.css";

// /settings (v3 Account Y1–Y4): Account · Security · Connections · Data & privacy.
// Yazma uçları hazır (B1–B4): kullanıcı adı, e-posta (onay bağlantılı), şifre, Google bağlantısı, veri dışa aktarma.
// Google bağlantısını kesme, veri dışa aktarma ve Yahoo (ertelendi) için uç nokta adı uydurulmadı: pasif kalır.
const WRITE_API = import.meta.env?.VITE_ACCOUNT_API !== "0";   // backend B1-B4 hazır: varsayılan açık, "0" kapatır
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

function EmailRow({ me, token }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const [note, setNote] = useState(me.pending_email ? { type: "ok", text: `Confirmation sent to ${me.pending_email}.` } : null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: val.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not change the email");
      setNote({ type: "ok", text: `We sent a confirmation link to ${d.pending_email || val.trim()}. Your email changes once you open it.` });
      setEdit(false); setVal("");
    } catch (e) { setNote({ type: "err", text: e.message }); } finally { setBusy(false); }
  };
  return (
    <>
      <Row label="Email" action={!edit && <Button variant="quiet" onClick={() => setEdit(true)}>Edit</Button>}>
        {maskEmail(me.email)}<small>Used to sign in and to reset your password.</small>
      </Row>
      {edit && (
        <>
          <Field label="New email" type="email" autoComplete="email" value={val} onChange={(e) => setVal(e.target.value)} />
          <div className="st-actions">
            <Button variant="primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(val.trim())} onClick={send}>{busy ? "Sending…" : "Send confirmation"}</Button>
            <Button variant="quiet" onClick={() => { setEdit(false); setVal(""); }}>Cancel</Button>
          </div>
        </>
      )}
      {note && <p className={`st-note ${note.type}`} role="status">{note.text}</p>}
    </>
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
        <EmailRow me={me} token={token} />
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

function SecurityTab({ me, token, logout, onToken }) {
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
      if (d.token) onToken(d.token);   // diğer oturumlar kapandı: yeni jeton saklanmazsa kullanıcı da düşer
      setF({ cur: "", next: "", rep: "" }); setMsg({ type: "ok", text: "Password updated. Other devices were signed out." });
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

function ConnectionsTab({ me, token, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const unlink = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/account/google/unlink", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Could not turn off Google sign-in");
      onSaved({ google_linked: false });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Sign-in</p>
        <Row label="Google" action={me.google_linked && <Button variant="outline" disabled={busy || !me.has_password} onClick={unlink}>{busy ? "Working…" : "Turn off"}</Button>}>
          {me.google_linked ? "Google sign-in is on" : "Google sign-in is off"}
          <small>{me.has_password ? (me.google_linked ? "You can still sign in with your email and password." : "Sign in with email and password.") : "Google is your only sign-in method, so it can't be turned off."}</small>
        </Row>
        {err && <p className="st-note err" role="alert">{err}</p>}
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

function DataTab({ me, token }) {
  const navigate = useNavigate();
  const [exp, setExp] = useState({ busy: false, type: "", text: "" });
  const requestExport = async () => {
    setExp({ busy: true, type: "", text: "" });
    try {
      const r = await fetch("/api/account/export", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw new Error("You already requested an export in the last 24 hours. Check your inbox.");
      if (!r.ok) throw new Error(d.detail || "Could not send the export");
      setExp({ busy: false, type: "ok", text: `A copy is on its way to ${d.email || "your email"}.` });
    } catch (e) { setExp({ busy: false, type: "err", text: e.message }); }
  };
  const legal = [["Terms of service", "/terms-of-service"], ["Privacy policy", "/privacy-policy"], ["Community guidelines", "/community-guidelines"]];
  return (
    <>
      <Panel pad>
        <p className="pa-eyebrow">Legal</p>
        {legal.map(([l, to], i) => (
          <Row key={to} label={l} action={<Button as={Link} to={to} variant="quiet">View</Button>}>
            {i === 0 ? (me.terms_current ? (me.terms_accepted_at ? `Accepted ${since(me.terms_accepted_at) || ""}` : "Current version accepted") : "A newer version is waiting for you") : <>{" "}</>}
          </Row>
        ))}
      </Panel>
      <Panel pad>
        <p className="pa-eyebrow">Your data</p>
        <Row label="Download my data" action={<Button variant="outline" disabled={exp.busy} onClick={requestExport}>{exp.busy ? "Sending…" : "Request export"}</Button>}>
          We'll email a copy of your profile, rosters, lineups and RankIt diary.
        </Row>
        {exp.text && <p className={`st-note ${exp.type}`} role="status">{exp.text}</p>}
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
  const { token, user, isLoggedIn, logout, login } = useAuth();
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
            : tab === "account" ? <AccountTab me={me} token={token} onSaved={(d) => { setMe((m) => ({ ...m, ...d })); if (d.username && d.username !== user?.username) login(token, { ...user, username: d.username }); }} />
            : tab === "security" ? <SecurityTab me={me} token={token} logout={logout} onToken={(t) => login(t, user)} />
            : tab === "connections" ? <ConnectionsTab me={me} token={token} onSaved={(d) => setMe((m) => ({ ...m, ...d }))} />
            : <DataTab me={me} token={token} />}
        </div>
      </div>
    </div>
  );
}
