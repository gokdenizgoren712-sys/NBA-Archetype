/* Ekran 2j — "Skins, contained to the collectible".
 *
 * Görsel kaynak `RankIt Redesign.dc.html#2j` + `#4d`: kapat / SELECT SKIN
 * başlığı, All · Earned · Locked sekmeleri, üç sütunlu karo ızgarası, bir
 * açıklama kutusu ve altta tek altın eylem "Apply {Name}".
 *
 * Kilitli karo KOŞULU gösterir, asla önizleme değil (4d: "Locked skins have
 * no share art. You cannot share a card you haven't earned"): soluk zemin
 * rengi + perde + kilit + koşul. Katalog ve kilit durumu UÇTAN (`GET /skins`);
 * burada hiçbir kilit türetilmiyor, sunucu kilitli derse kilitlidir.
 *
 * Yığın: 6a kendi `.rankit-app` kökünde ve kaydırılabilir; ekran bu yüzden
 * `position:fixed` — kullanıcı eylem satırına kaydırmışken de tam ekran açılır.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { useResource } from "./useResource";
import { useDialog } from "./useDialog";
import { useBackClose } from "./backStack";
import { ErrorState, Loading, SkeletonRows } from "./States";
import {
  SKIN_NAMES, SKIN_NOTES, skinTokens, skinTabs, tileCondition, applyLabel, lockSwatch, normalizeSkin,
} from "./skins";

const TABS = [["all", "All"], ["earned", "Earned"], ["locked", "Locked"]];
const INTRO = "A skin paints this card and its share image. It never touches app chrome.";

const LOCK = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
  strokeLinecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></svg>;

/* Seçilebilir karo: kartın minyatürü (2j). BUILD §1.5: ızgara küçük
   resimlerinde 6.5–8.5px tipe izin var — küçük resim kartın resmidir. */
export function SkinThumb({ id, card }) {
  const t = skinTokens(id, { homeColor: card.homeColor, awayColor: card.awayColor });
  const tear = 30;
  const mask = t.stub
    ? `radial-gradient(circle 6px at 0 ${tear}px,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 6px at 100% ${tear}px,#0000 98%,#000) right/51% 100% no-repeat`
    : undefined;
  const eyebrow = id === "broadsheet" ? "MATCH REPORT" : id === "gilt" ? "INSTANT CLASSIC" : card.eyebrow;
  return <div className={`ri-skin-thumb${t.stub ? " is-stub" : ""}`} data-skin-thumb={id}
    style={{ background: t.base, color: t.ink, ...(mask ? { WebkitMask: mask, mask } : null) }}>
    {t.sheen !== "none" && <i style={{ background: t.sheen }} />}
    {t.wash && <i style={{ background: t.wash }} />}
    {t.stub && <i className="ri-skin-tear" style={{ top: tear, borderTopColor: t.notch }} />}
    <span className={`ri-skin-eyebrow${id === "broadsheet" ? " is-ruled" : ""}`}
      style={{ color: t.eyebrow, borderBottomColor: t.rule }}>{eyebrow}</span>
    {id === "broadsheet"
      ? <b className="ri-skin-report" style={{ color: t.score }}>{card.homeAbbr} {card.homeScore}<br />{card.awayAbbr} {card.awayScore}</b>
      : <b className="ri-skin-score" style={{ color: t.score }}>{card.score}</b>}
  </div>;
}

/* Web 11b da aynı kilitli karoyu çizer (Aşama 17). */
export function LockedTile({ id, lines }) {
  return <div className="ri-skin-locked">
    <i style={{ background: lockSwatch(id) }} />
    <div>{LOCK}<span>{lines.map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</span></div>
  </div>;
}

export default function SkinPicker({ entryId, matchId, card, initial = "default", preset = null, onApplied, onClose }) {
  const dialog = useDialog({ onClose, label: "Select skin" });
  useBackClose(onClose);
  const { data, error, loading, reload } = useResource(`skins:${entryId}`, () => rankitApi.skins(entryId));
  const [tab, setTab] = useState("all");
  // null = sunucunun sectigi. "Use it" (6a) yeni acilan skinle gelir.
  const [picked, setPicked] = useState(preset);
  const [focus, setFocus] = useState(null);        // kilitli karoya dokunuldu
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  const list = data?.skins || [];
  const tabs = skinTabs(list);
  const current = normalizeSkin(data?.selected || initial);
  const chosen = picked || current;
  const shown = tabs[tab] || list;
  const focused = list.find((s) => s.id === focus);
  const note = focused && tileCondition(focused)
    ? `${SKIN_NAMES[focused.id]} — ${SKIN_NOTES[focused.id]}` : picked ? SKIN_NOTES[picked] : INTRO;

  const apply = async () => {
    if (saving) return;
    if (chosen === current) { onClose(); return; }
    setSaving(true); setFailure("");
    try {
      await rankitApi.setSkin(entryId, matchId, chosen);
      onApplied?.(chosen);
      onClose();
    } catch (err) {
      // Kart degismedi; sebebi soyle (kilit sunucuda kapanmissa 403).
      setFailure(err?.offline ? "You're offline. Your card is unchanged."
        : err?.status === 403 ? `${SKIN_NAMES[chosen]} is still locked. Your card is unchanged.`
          : `Could not apply ${SKIN_NAMES[chosen]}. Your card is unchanged.`);
    } finally { setSaving(false); }
  };

  const screen = <section {...dialog} className="ri-skins">
    <header className="ri-skins-head">
      <button type="button" onClick={onClose} aria-label="Close skins"><X size={15} /></button>
      <h1>Select skin</h1>
      <span aria-hidden="true" />
    </header>
    <div className="ri-skins-body">
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading skins"><SkeletonRows count={3} height={126} /></Loading>}
      {data && <>
        <div className="ri-skins-tabs">
          {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key}
            className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}{key === "all" ? ` ${list.length}` : ""}</button>)}
        </div>
        {!shown.length
          ? <p className="ri-skins-empty">{tab === "locked" ? "Nothing locked. Every skin is yours." : "Nothing here yet."}</p>
          : <div className="ri-skins-grid" role="radiogroup" aria-label="Skins">
            {shown.map((s) => {
              const lines = tileCondition(s);
              const selected = !lines && s.id === chosen;
              return <button type="button" key={s.id} role="radio" aria-checked={selected}
                aria-disabled={lines ? "true" : undefined}
                aria-label={lines ? `${SKIN_NAMES[s.id]}, locked. ${lines.join(" ").toLowerCase()}` : SKIN_NAMES[s.id]}
                className={`ri-skin-tile${selected ? " is-selected" : ""}${lines ? " is-locked" : ""}`}
                onClick={() => { if (lines) { setFocus(s.id); return; } setFocus(null); setPicked(s.id); setFailure(""); }}>
                {lines ? <LockedTile id={s.id} lines={lines} /> : <SkinThumb id={s.id} card={card} />}
                <span className="ri-skin-name">{SKIN_NAMES[s.id] || s.name}</span>
              </button>;
            })}
          </div>}
        <p className="ri-skins-note" aria-live="polite">{note}</p>
      </>}
    </div>
    <footer className="ri-skins-foot">
      {failure && <p className="ri-skins-failure" role="alert">{failure}</p>}
      <button type="button" className="ri-skins-apply" onClick={apply} disabled={!data || saving}
        aria-busy={saving}>{saving ? "Applying…" : applyLabel(chosen)}</button>
    </footer>
  </section>;
  const host = document.querySelector(".rankit-app");
  return host ? createPortal(screen, host) : screen;
}
