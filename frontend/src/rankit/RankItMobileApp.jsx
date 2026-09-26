import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import RankItPrototype from "./RankItPrototype";
import { API_ROOT, rankitApi, rankitMe, rankitMobileExchange } from "./rankitApi";
import { pkceStart, pkceVerifier, pkceClear } from "./pkce";
import { ConnectScreen, FollowPicker } from "./redesign/FirstRun";
import { RankItMark } from "./redesign/BrandMark";
// Games by Primary Arch: misafirin bitmiş sonucu giriş sırasında cihazda bekler
// (giriş kabuğu yeniden kurar, oyun söner) — hesap gelince buradan gönderilir.
import { flushPendingScore } from "../arcade/pendingScore";
import "./rankit.css";
import "./rankit-mobile.css";

const TOKEN_KEY = "nba_arch_token";
const USER_KEY = "nba_arch_user";
// 4g "Look around first": hesapsiz gezinme. Okuma uclari kimliksiz calisiyor;
// yazan her uc 401 "Sign in to use RankIt" donuyor ve uygulama onu gosteriyor.
const GUEST_KEY = "rankit_guest";

function readUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export default function RankItMobileApp() {
  const [user, setUser] = useState(() => localStorage.getItem(TOKEN_KEY) ? readUser() : null);
  const [checking, setChecking] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [guest, setGuest] = useState(() => localStorage.getItem(GUEST_KEY) === "1");
  // 4h bir kez: null = henuz bilinmiyor, true = goster, false = gecildi.
  const [firstRun, setFirstRun] = useState(null);

  const acceptDeepLink = async rawUrl => {
    if (!rawUrl?.startsWith("rankit://auth")) return;
    const code = new URL(rawUrl).searchParams.get("code");
    if (!code) { setAuthError("The authorization link is incomplete."); return; }
    setAuthBusy(true); setAuthError("");
    try {
      const data = await rankitMobileExchange(code, pkceVerifier());
      pkceClear();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      localStorage.removeItem(GUEST_KEY); setGuest(false);
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

  // Giris ve kayit AYNI yoldan doner: ikisi de sitede biter, /rankit/mobile-auth
  // tek kullanimlik kodu uretir ve rankit:// derin baglantisiyla geri gelir.
  // Kayit sayfasi ?next= destekliyor, yani yeni hesap da ayni koda iner.
  // PKCE: sayfaya yalnız doğrulayıcının özeti gider; kod ona bağlanır ve
  // yalnız bu cihazdaki doğrulayıcıyla takas edilir (bkz. pkce.js).
  const authPath = async () => {
    const pkce = await pkceStart().catch(() => null);
    return pkce ? `/rankit/mobile-auth?challenge=${pkce.challenge}` : "/rankit/mobile-auth";
  };
  const openSite = async path => {
    setAuthBusy(true); setAuthError("");
    try { await Browser.open({ url: `${API_ROOT}${path}`, presentationStyle: "popover" }); }
    catch { setAuthError("Could not open Primary Arch."); }
    finally { setAuthBusy(false); }
  };
  const startWebAuth = async () => openSite(await authPath());
  const startSignup = async () => openSite(`/register?next=${encodeURIComponent(await authPath())}`);
  const browseAsGuest = () => { localStorage.setItem(GUEST_KEY, "1"); setGuest(true); };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
    localStorage.removeItem(GUEST_KEY); setGuest(false); setUser(null); setFirstRun(null);
  };

  // 4h: giristen sonra, hesap basina BIR KEZ. Bayrak sunucuda
  // (rankit_user_settings.onboarded) -- yeni bir cihazda yeniden sormaz.
  useEffect(() => {
    if (!user) return undefined;
    flushPendingScore({ token: localStorage.getItem(TOKEN_KEY) }).catch(() => {});
    let alive = true;
    rankitApi.onboarding("")
      .then(d => alive && setFirstRun(!d.done))
      .catch(() => alive && setFirstRun(false));   // sorulamadiysa uygulamayi kilitleme
    return () => { alive = false; };
  }, [user]);

  if (checking || (user && firstRun === null)) return <main className="ri-mobile-auth"><div className="ri-auth-loading"><RankItMark size={68} label="RankIt"/><span>Checking your Primary Arch account…</span></div></main>;
  if (!user && !guest) return <ConnectScreen mark={<RankItMark size={24}/>} busy={authBusy} error={authError}
    onConnect={startWebAuth} onCreate={startSignup} onBrowse={browseAsGuest}/>;
  if (user && firstRun) return <FollowPicker onDone={() => setFirstRun(false)}/>;
  return <div className="ri-mobile-shell">
    {user
      ? <button className="ri-mobile-account" onClick={logout} aria-label="Log out"><span>{user.username?.slice(0, 2).toUpperCase()}</span><LogOut size={14}/></button>
      // Misafir: ayni kose, "Sign in" -- 4g'ye geri doner.
      : <button className="ri-mobile-account" onClick={logout} aria-label="Sign in"><span>IN</span><LogIn size={14}/></button>}
    <RankItPrototype nativeBack accountAction={logout} accountActionLabel={user ? 'Log out' : 'Sign in'}
      onAccountDeleted={user ? logout : undefined}/>
  </div>;
}
