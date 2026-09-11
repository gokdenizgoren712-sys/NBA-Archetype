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
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { BROADCAST_COUNTRIES, localeCountry } from "../rankitPrefs";
import { useBackClose } from "./backStack";

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

function Group({ title, children }) {
  return (
    <section className="ri-set-group">
      <div className="ri-chip-title">{title}</div>
      <div className="ri-set-card">{children}</div>
    </section>
  );
}

export default function Settings({ prefs, setPref, followCount, onClose, onOpenFollows }) {
  // onOpenFollows yoksa satir BAGLANTI DEGIL: ok isareti koymak, hicbir
  // yere gitmeyen bir kapi cizmek olur. Takip duzenleyicisi 4h (ilk kurulum,
  // "turnuva ve kulup sec") ile gelecek; o gelince buraya baglanacak.
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rankitApi.settings().then(setAccount).catch(() => setAccount({ alerts_running_hot: true }));
  }, []);

  // Android geri tusu: once BU ekran kapanir, Profil'e donulur. Kayit
  // olmadan kabugun zinciri "tab !== Home" dalina dusup Home'a atliyordu.
  useBackClose(onClose);

  // aria-modal iddia ediliyorsa Escape kapatmali; odak hapsi 8. prompt'ta
  // butun sheet'lerle birlikte, tek elden geliyor.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="ri-settings" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="ri-settings-head">
        <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
        <h2>Settings</h2>
      </div>

      <div className="ri-settings-body">
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
            value={`${followCount} followed`} onClick={onOpenFollows} />
        </Group>

        <Group title="ALERTS">
          <Switch label="Running hot" hint="A match you can still watch passes 4.0"
            on={account?.alerts_running_hot ?? true} busy={busy || !account}
            onChange={(v) => setAccountFlag("alerts_running_hot", v)} />
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

        <Group title="LEGAL">
          {[["/privacy-policy", "Privacy policy"],
            ["/terms-of-service", "Terms of service"],
            ["/rankit/download", "Update RankIt"]].map(([href, label]) => (
            <a key={href} className="ri-set-line" href={href}>
              <span className="ri-set-label"><strong>{label}</strong></span>
              <ChevronRight size={14} color={INK_4} />
            </a>
          ))}
        </Group>
      </div>
    </div>
  );
  return host ? createPortal(screen, host) : screen;
}
