import { useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import RankItPrototype from "./RankItPrototype";
import { API_ROOT, rankitMe, rankitMobileExchange } from "./rankitApi";
import "./rankit.css";
import "./rankit-mobile.css";

const TOKEN_KEY = "nba_arch_token";
const USER_KEY = "nba_arch_user";

function readUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

function MobileMark({ size = 68 }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="RankIt">
    <polygon points="24,3 34.5,5.8 42.2,13.5 45,24 42.2,34.5 34.5,42.2 24,45 13.5,42.2 5.8,34.5 3,24 5.8,13.5 13.5,5.8" stroke="#FFB11B" strokeWidth="2.4" strokeLinejoin="round"/>
    <path d="M16 35V13h10.2c6 0 9.4 3.2 9.4 8.2 0 3.7-2 6.4-5.4 7.5L36 35h-6.6l-7-8.3h3.3c2.7 0 4.2-1.7 4.2-4.7 0-2.8-1.6-4.3-4.5-4.3h-3.7V35H16Z" fill="#FFB11B"/>
  </svg>;
}

function AuthScreen({ busy, error, onStart }) {
  return <main className="ri-mobile-auth">
    <section className="ri-auth-card ri-web-auth-card">
      <div className="ri-auth-brand"><MobileMark/><strong>RANKIT</strong><small>BY PRIMARY ARCH</small></div>
      <div className="ri-auth-copy"><h1>Your Primary Arch account</h1><p>RankIt uses the same account, security settings and profile as Primary Arch. Continue on the secure website with your password or Google account.</p></div>
      <div className="ri-auth-trust"><ShieldCheck size={19}/><span><strong>One account across both products</strong><small>No separate RankIt user database or password.</small></span></div>
      {error && <p className="ri-auth-error">{error}</p>}
      <button className="ri-auth-submit" disabled={busy} onClick={onStart}>{busy ? "Connecting…" : "Continue with Primary Arch"}</button>
      <p className="ri-auth-legal">A one-time code returns you to RankIt. Your password and Google credential never enter the app.</p>
    </section>
  </main>;
}

export default function RankItMobileApp() {
  const [user, setUser] = useState(() => localStorage.getItem(TOKEN_KEY) ? readUser() : null);
  const [checking, setChecking] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const acceptDeepLink = async rawUrl => {
    if (!rawUrl?.startsWith("rankit://auth")) return;
    const code = new URL(rawUrl).searchParams.get("code");
    if (!code) { setAuthError("The authorization link is incomplete."); return; }
    setAuthBusy(true); setAuthError("");
    try {
      const data = await rankitMobileExchange(code);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      await Browser.close().catch(() => {});
    } catch (error) {
      setAuthError(error.message || "Could not authorize this device.");
    } finally { setAuthBusy(false); }
  };

  useEffect(() => {
    document.title = "RankIt by Primary Arch";
    if (!localStorage.getItem(TOKEN_KEY)) setChecking(false);
    else rankitMe().then(data => {
      localStorage.setItem(USER_KEY, JSON.stringify(data)); setUser(data);
    }).catch(() => {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setUser(null);
    }).finally(() => setChecking(false));

    let listener;
    CapacitorApp.addListener("appUrlOpen", event => acceptDeepLink(event.url)).then(handle => { listener = handle; });
    CapacitorApp.getLaunchUrl().then(event => event?.url && acceptDeepLink(event.url)).catch(() => {});
    return () => listener?.remove();
  }, []);

  const startWebAuth = async () => {
    setAuthBusy(true); setAuthError("");
    try { await Browser.open({ url: `${API_ROOT}/rankit/mobile-auth`, presentationStyle: "popover" }); }
    catch { setAuthError("Could not open Primary Arch sign-in."); }
    finally { setAuthBusy(false); }
  };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setUser(null);
  };

  if (checking) return <main className="ri-mobile-auth"><div className="ri-auth-loading"><MobileMark/><span>Checking your Primary Arch account…</span></div></main>;
  if (!user) return <AuthScreen busy={authBusy} error={authError} onStart={startWebAuth}/>;
  return <div className="ri-mobile-shell">
    <button className="ri-mobile-account" onClick={logout} aria-label="Log out"><span>{user.username?.slice(0, 2).toUpperCase()}</span><LogOut size={14}/></button>
    <RankItPrototype/>
  </div>;
}
