/* Ekran 6c — Discover filtre çekmecesi, SOLDAN.
 *
 * Görsel kaynak `RankIt Redesign.dc.html#6c`: sol 0, 288px (en fazla %85),
 * `#1a1b1e`, sağ kenarda hairline ve gölge; arkası `rgba(0,0,0,.55)` perde.
 * Başlık "Filters" + kapat; bölümler SPORT / STAGE / MINIMUM HEAT; altta
 * canlı sayılı "Show N matches". Seçimler ONAYA kadar bekler — düğme, o
 * seçimle kaç maç geleceğini gerçek sayıyla söylüyor.
 *
 * "Season & competition" tahtada yok ama uygulamada çalışan bir filtre;
 * kaldırmak geri adım olurdu, en alta taşındı.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialog } from "./useDialog";
import { useBackClose } from "./backStack";
import {
  SPORTS, STAGES, HEAT_LEVELS, EMPTY_FILTERS, toggle, heatName, activeCount, showLabel,
  heatStep, heatFromStep, heatNameColor,
} from "./discoverFilters";

export default function FilterDrawer({ value, families = [], allSeasons = [], countFor, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  // Sayi HANGI taslaga ait? Eslesmiyorsa hala sayiliyor demektir — ayri bir
  // "counting" durumu efekt icinde senkron set edilmesin diye turetiliyor.
  const [result, setResult] = useState({ key: null, n: null, failed: false });
  const draftKey = JSON.stringify(draft);
  const count = { n: result.n, failed: result.failed, counting: result.key !== draftKey };
  const dialog = useDialog({ onClose, label: "Filters" });
  useBackClose(onClose);
  const version = useRef(0);

  // Canli sayi: taslak degisince kisa bir beklemeyle uca sorulur.
  useEffect(() => {
    const mine = ++version.current;
    const timer = setTimeout(() => {
      countFor(draft)
        .then((n) => { if (mine === version.current) setResult({ key: draftKey, n, failed: false }); })
        .catch(() => { if (mine === version.current) setResult({ key: draftKey, n: null, failed: true }); });
    }, 220);
    return () => clearTimeout(timer);
  }, [draft, draftKey, countFor]);

  const family = families.find((f) => f.name === draft.competition);
  const seasonOptions = family ? family.seasons : allSeasons;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const pickSport = (s) => set({ sport: toggle(draft.sport, s), competition: "All", season: "All" });
  const pickCompetition = (name) => {
    const fam = families.find((f) => f.name === name);
    set({ competition: name, season: name === "All" || !fam ? "All" : fam.seasons[0] });
  };
  const chosen = heatName(draft.minHeat);
  const n = activeCount(draft);

  const drawer = <div className="ri-drawer-scrim" onClick={onClose}>
    <aside {...dialog} className="ri-drawer" onClick={(e) => e.stopPropagation()}>
      <header className="ri-drawer-head">
        <span>Filters</span>
        <button type="button" onClick={onClose} aria-label="Close filters"><X size={15} /></button>
      </header>
      <div className="ri-drawer-body">
        <p className="ri-drawer-eyebrow">SPORT</p>
        <div className="ri-drawer-pills">{SPORTS.map((s) =>
          <button type="button" key={s} aria-pressed={draft.sport === s} className={draft.sport === s ? "on" : ""}
            onClick={() => pickSport(s)}>{s}</button>)}</div>

        <p className="ri-drawer-eyebrow">STAGE</p>
        <div className="ri-drawer-pills">{STAGES.map((s) =>
          <button type="button" key={s} aria-pressed={draft.status === s} className={draft.status === s ? "on" : ""}
            onClick={() => set({ status: toggle(draft.status, s) })}>{s}</button>)}</div>

        <p className="ri-drawer-eyebrow">MINIMUM HEAT</p>
        {/* §5.5: ısı 20 puanın altında YOK. Bu filtre seçilince yeni ya da az
            puanlanmış maçlar düşer — sayı düğmesi bunu dürüstçe gösteriyor. */}
        {/* 6c: ısı rampası üzerinde bir kaydırıcı. 0 = sınır yok. */}
        <div className="ri-drawer-heat">
          <input type="range" min={0} max={HEAT_LEVELS.length} step={1} value={heatStep(draft.minHeat)}
            onChange={(e) => set({ minHeat: heatFromStep(e.target.value) })}
            aria-label="Minimum heat" aria-valuetext={chosen ? `${chosen} or better` : "Any heat"} />
        </div>
        <p className="ri-drawer-sentence">{chosen
          ? <>Only matches the community rated <b style={{ color: heatNameColor(chosen) }}>{chosen}</b> or better.</>
          : "Any heat, including matches too new to have one."}</p>

        <p className="ri-drawer-eyebrow">SEASON &amp; COMPETITION</p>
        <div className="ri-drawer-selects">
          <label><span>Competition</span>
            <select value={draft.competition} onChange={(e) => pickCompetition(e.target.value)}>
              <option value="All">All competitions</option>
              {families.filter((f) => draft.sport === "All" || f.sport === draft.sport)
                .map((f) => <option key={f.key} value={f.name}>{f.name}</option>)}
            </select></label>
          <label><span>Season</span>
            <select value={draft.season} onChange={(e) => set({ season: e.target.value })}>
              <option value="All">All seasons</option>
              {seasonOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
        </div>
      </div>
      <footer className="ri-drawer-foot">
        {n > 0 && <button type="button" className="ri-drawer-clear" onClick={() => setDraft({ ...EMPTY_FILTERS })}>Clear all</button>}
        <button type="button" className="ri-drawer-show" aria-busy={count.counting}
          disabled={!count.counting && !count.failed && count.n === 0}
          onClick={() => { onApply(draft); onClose(); }}>{showLabel(count.n, count)}</button>
      </footer>
    </aside>
  </div>;

  const host = document.querySelector(".rankit-app");
  return host ? createPortal(drawer, host) : drawer;
}
