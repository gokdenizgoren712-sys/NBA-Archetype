/* Ekran 3g — "Settings: grouped, no orphan rows".
 *
 * Başlıktaki "no orphan rows" bütün tasarım: her satır bir gruba ait ve her
 * grup tek bir kart. Eskisi düz bir liste hâlindeydi — "Broadcast country",
 * "Hide scores", "Reduce motion", sonra üç yasal bağlantı, hepsi aynı
 * kolonda, aralarında bir ilişki iddiası olmadan.
 *
 * Ayarların nerede durduğu da bir karar, ve ikiye ayrılıyor:
 *   * CİHAZ — skor gizleme, hareket, yayın ülkesi. Bunlar "bu ekranda bana
 *     nasıl görünsün" sorusunun cevabı; aynı hesapla telefonda skorları
 *     gizleyip webde göstermek meşru bir istek (bkz. rankitPrefs.js).
 *   * HESAP — sunucunun DAVRANDIĞI ayarlar. "Running hot" uyarısı sunucuda
 *     doğuyor (api/rankit_notify.py), o yüzden anahtarı da orada olmalı;
 *     istemcide gizlemek uyarıyı üretmeyi durdurmaz.
 *
 * "Heat as numbers too" anahtar DEĞİL, bir güvence satırı. §1'in duran kuralı
 * "sayısal değer her zaman rengin yanında gider" diyor; bunu kapatılabilir
 * yapmak, ürünün kendi kuralını kırmayı teklif etmek olurdu. Satır duruyor —
 * tasarım onu istiyor — ama değeri "Always", tıpkı "Reduce motion / System"
 * gibi.
 */
import { useCallback, useEffect, useState } from "react";
import { ErrorState, Loading, SkeletonRows } from "./States";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rankitApi, rankitDeleteAccount, rankitMe, announceBlock } from "../rankitApi";
import { reviewerFromStorage } from "./reviewIdentity";
import { LEGAL_PAGES, externalLinkProps } from "../openExternal";
import { IS_STORE_BUILD } from "../channel";
import { BROADCAST_COUNTRIES, localeCountry } from "../rankitPrefs";
import { useBackClose } from "./backStack";
import { FollowPicker } from "./FirstRun";
import { useDialog } from "./useDialog";

const INK_4 = "#7f868b";

/* 46x28 anahtar. Açıkken --ri-green: yeşil burada "durum" değil "açık" —
   ısı paleti veri için ayrılmış (§1), bir anahtar veri değil. */
function Switch({ on, onChange, label, hint, busy }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} className="ri-set-toggle"
      onClick={() => onChange(!on)} disabled={busy}>
      <span className="ri-set-label">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className={`ri-switch${on ? " on" : ""}`} aria-hidden="true"><i /></span>
    </button>
  );
}

function Row({ label, hint, value, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="ri-set-line" onClick={onClick}>
      <span className="ri-set-label"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <span className="ri-set-value">{value}</span>
      {onClick && <ChevronRight size={14} color={INK_4} />}
    </Tag>
  );
}

/* Hesap silme (Google Play: uygulama içinden de silinebilmeli; web karşılığı
   /account/delete). Satır açılınca aynı kartın içinde onay alanı çıkar — ayrı
   bir diyalog değil, geri tuşu Ayarlar'ı kapatmaya devam eder. Sunucu yeniden
   doğrulama ister: şifreli hesapta şifre, Google hesabında kullanıcı adı. */
function DeleteAccount({ onDeleted }) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || me) return undefined;
    let alive = true;
    rankitMe().then((d) => alive && setMe(d)).catch(() => alive && setError("Could not load your account."));
    return () => { alive = false; };
  }, [open, me]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await rankitDeleteAccount(me?.has_password ? { password: value } : { confirm: value });
      onDeleted();
    } catch (err) {
      setError(err.message || "Could not delete the account.");
      setBusy(false);
    }
  };

  if (!open) return <Row label="Delete account" hint="Permanently delete your Primary Arch account" onClick={() => setOpen(true)} />;
  return (
    <form className="ri-delete" onSubmit={submit}>
      <strong>Delete account</strong>
      <p>This permanently deletes your Primary Arch account and everything in RankIt: diary, ratings, reviews, lists and follows. It can't be undone.</p>
      <label htmlFor="ri-delete-input">{me?.has_password ? "Enter your password to confirm" : `Type your username${me ? ` (${me.username})` : ""} to confirm`}</label>
      <input id="ri-delete-input" type={me?.has_password ? "password" : "text"} value={value} autoComplete={me?.has_password ? "current-password" : "off"}
        onChange={(e) => setValue(e.target.value)} />
      {error && <p role="alert" className="ri-delete-error">{error}</p>}
      <div className="ri-delete-actions">
        <button type="button" className="ri-delete-cancel" onClick={() => { setOpen(false); setValue(""); setError(""); }}>Keep account</button>
        <button type="submit" className="ri-delete-go" disabled={!me || !value || busy}>{busy ? "Deleting…" : "Delete"}</button>
      </div>
    </form>
  );
}

/* PRIVACY & SAFETY → Blocked accounts (B5). DeleteAccount gibi satir
   yerinde acilir; geri tusu Ayarlar'i kapatmaya devam eder. Yalniz senin
   engellediklerin listelenir -- seni kimin engelledigi soylenmez. */
function BlockedAccounts() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    rankitApi.blocks().then((d) => alive && setRows(d.blocked || []))
      .catch(() => alive && setError("Could not load blocked accounts."));
    return () => { alive = false; };
  }, [open]);

  const unblock = async (row) => {
    setBusyId(row.id); setError("");
    try {
      await rankitApi.unblock(row.id);
      announceBlock(row.id, false);
      setRows((v) => v.filter((r) => r.id !== row.id));
    } catch { setError(`Could not unblock @${row.username}. Try again.`); }
    finally { setBusyId(null); }
  };

  if (!open) return <Row label="Blocked accounts" hint="You and they can't see each other's reviews, replies or lists"
    onClick={() => setOpen(true)} />;
  return (
    <div className="ri-delete">
      <strong>Blocked accounts</strong>
      {rows === null && !error && <Loading label="Loading blocked accounts"><SkeletonRows count={2} height={44}/></Loading>}
      {rows?.length === 0 && <p>You haven&apos;t blocked anyone. Block someone from the ⋯ menu on their review, reply or profile.</p>}
      {rows?.map((row) => (
        <div key={row.id} className="ri-blocked-row">
          <span>@{row.username}</span>
          <button type="button" onClick={() => unblock(row)} disabled={busyId === row.id} aria-busy={busyId === row.id}
            aria-label={`Unblock @${row.username}`}>{busyId === row.id ? "Unblocking…" : "Unblock"}</button>
        </div>
      ))}
      {error && <p role="alert" className="ri-delete-error">{error}</p>}
      <div className="ri-delete-actions">
        <button type="button" className="ri-delete-cancel" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="ri-set-group">
      <div className="ri-chip-title">{title}</div>
      <div className="ri-set-card">{children}</div>
    </section>
  );
}

export default function Settings({ prefs, setPref, followCount, onClose, onFollowsChanged, accountAction, accountActionLabel, onAccountDeleted }) {
  // "Competitions & clubs" 4h'nin secicisini DUZENLEYICI kipinde aciyor.
  const [editingFollows, setEditingFollows] = useState(false);
  // Kaydedilen sayi, profil verisinden gelenin YERINE gecer; kaydedilmediyse
  // profilinki. useState(followCount) profil sonradan yuklenince eskide kalirdi.
  const [saved, setCount] = useState(null);
  const count = saved ?? followCount;
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadAccount = useCallback(() => {
    rankitApi.settings().then(data => {setAccount(data);setLoadError(null);}).catch(setLoadError);
  }, []);
  useEffect(loadAccount, [loadAccount]);

  // Android geri tusu: once BU ekran kapanir, Profil'e donulur. Kayit
  // olmadan kabugun zinciri "tab !== Home" dalina dusup Home'a atliyordu.
  useBackClose(onClose);

  // Escape, odak tuzagi ve odagin geri verilmesi tek elden (§4.2).
  // "!editingFollows" gerekmiyor: takip duzenleyici de bir dialog ve
  // yiginda ustte oldugu icin Escape once onu kapatiyor.
  const dialog = useDialog({ onClose, label: "Settings" });
  const signedIn = reviewerFromStorage(localStorage)?.id != null;

  const setAccountFlag = async (key, value) => {
    if (busy) return;
    setBusy(true);
    // İyimser: anahtar parmağın altında beklememeli. Sunucu reddederse
    // yanıtın kendisi doğruyu geri yazıyor.
    setAccount((v) => ({ ...v, [key]: value }));
    try { setAccount(await rankitApi.saveSettings({ [key]: value })); }
    catch { setAccount((v) => ({ ...v, [key]: !value })); }
    finally { setBusy(false); }
  };

  const country = prefs.broadcastCountry === "auto"
    ? (BROADCAST_COUNTRIES.find((c) => c.code === localeCountry())?.label || "Auto")
    : (BROADCAST_COUNTRIES.find((c) => c.code === prefs.broadcastCountry)?.label || "Auto");

  // PORTAL SART. Profil sekmesi .ri-tab-stage icinde render ediliyor ve o
  // kap, sekme kaydirma animasyonundan kalan bir transform (kimlik matrisi)
  // + will-change:transform tasiyor. Donusumlu bir ata, position:fixed icin
  // yeni bir kapsayici blok demek: ayarlar ekrani ekrani degil KAYDIRMA
  // ALANINI kapliyordu (top 64, genislik 343) ve Accessibility grubu
  // kesiliyordu. .rankit-app'e tasiniyor -- orasi zaten inset:0, ve token'lar
  // (--ri-card, --ri-line) orada tanimli.
  const host = typeof document !== "undefined" ? document.querySelector(".rankit-app") : null;
  const screen = (
    <div {...dialog} className="ri-settings">
      <div className="ri-settings-head">
        <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
        <h2>Settings</h2>
      </div>

      <div className="ri-settings-body">
        {/* Native hesap kontrolu 6b'nin sag ust kontrollerini kapatmasin. */}
        {accountAction && <Group title="PRIMARY ARCH ACCOUNT">
          <Row label={accountActionLabel || 'Account'} onClick={accountAction}/>
          {onAccountDeleted && <DeleteAccount onDeleted={onAccountDeleted}/>}
        </Group>}
        <Group title="SPOILERS">
          <Switch label="Hide scores by default" hint="Blurs score, heat and reviews"
            on={prefs.hideScores} onChange={(v) => setPref({ hideScores: v })} />
          <Switch label="Keep hiding until I rate" hint="Reveals a match once you log it"
            on={prefs.hideUntilRated} onChange={(v) => setPref({ hideUntilRated: v })} />
        </Group>

        <Group title="WHAT YOU FOLLOW">
          {/* Ülke bir seçim, bir sayfa değil: satırın kendisi seçici. */}
          <label className="ri-set-line" htmlFor="ri-country">
            <span className="ri-set-label"><strong>Broadcast country</strong></span>
            <select id="ri-country" value={prefs.broadcastCountry}
              onChange={(e) => setPref({ broadcastCountry: e.target.value })}>
              <option value="auto">Auto — {country}</option>
              {BROADCAST_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <Row label="Competitions &amp; clubs"
            value={`${count} followed`} onClick={() => setEditingFollows(true)} />
        </Group>

        <Group title="ALERTS">
          {loadError && <ErrorState error={loadError} onRetry={loadAccount}/>}
          {!account && !loadError && <Loading label="Loading alert preferences"><SkeletonRows count={1}/></Loading>}
          {account && <Switch label="Running hot" hint="A match you can still watch passes 4.0"
            on={!!account.alerts_running_hot} busy={busy}
            onChange={(v) => setAccountFlag("alerts_running_hot", v)} />}
        </Group>

        <Group title="ACCESSIBILITY">
          {/* Anahtar değil: §1 sayıyı zaten şart koşuyor, kapatmayı teklif
              etmek ürünün kendi güvencesini kırmayı teklif etmek olurdu. */}
          <Row label="Heat as numbers too" hint="Never colour alone" value="Always" />
          {/* Tasarim bunu anahtar DEGIL deger satiri olarak ciziyor: "Reduce
              motion - System". Bizde gercek bir gecersiz kilma var, onu
              kaldirmak bir denetimi kaybetmek olurdu. Iki istek ayni satirda
              bulusuyor: deger "System" (isletim sistemini izle) ya da
              "Always" (sistem acmasa da azalt), dokunmak ikisi arasinda
              gecer. Sistem ayari her iki durumda da saygi goruyor. */}
          <Row label="Reduce motion" value={prefs.reduceMotion ? "Always" : "System"}
            onClick={() => setPref({ reduceMotion: !prefs.reduceMotion })} />
        </Group>

        {signedIn && <Group title="PRIVACY & SAFETY">
          <BlockedAccounts />
        </Group>}

        {/* Sayfalar sitede: uygulamada uygulama içi tarayıcıda, tam adresle açılır
            (göreli bağlantı paketlenmiş uygulamayı yeniden yüklüyordu). "Update
            RankIt" yalnız siteden indirilen APK'da; mağaza derlemesinde yok. */}
        <Group title="LEGAL & SUPPORT">
          {[...LEGAL_PAGES, ...(IS_STORE_BUILD ? [] : [["/rankit/download", "Update RankIt"]])].map(([path, label]) => (
            <a key={path} className="ri-set-line" {...externalLinkProps(path)}>
              <span className="ri-set-label"><strong>{label}</strong></span>
              <ChevronRight size={14} color={INK_4} />
            </a>
          ))}
        </Group>
      </div>
    </div>
  );
  return <>
    {host ? createPortal(screen, host) : screen}
    {editingFollows && <FollowPicker mode="edit" onClose={() => setEditingFollows(false)}
      onDone={(r) => { setEditingFollows(false); if (r?.following_sources != null) setCount(r.following_sources); onFollowsChanged?.(); }} />}
  </>;
}
