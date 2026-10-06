// Oyuncu listesi sayfalarının ortak iskeleti (handoff 3b / 6a / 11c · mobil 19b).
// Masaüstü: solda 250px filtre kolonu | sağda kendi kaydıran içerik (ortam
// ışığı + hero + ızgara + "Load more"). Mobil (<768): kolon gizlenir; arama +
// "Filters" düğmesi (sayı rozeti) + aktif filtre çipleri, filtreler alt sayfada.
// Sayfa rengi `tint` ile değişir (arketip/faz seçimi) — .g-smoke .5s geçişli.
import { Children, useState } from "react";
import { Button, Sheet } from "../ui";
import PaIcon from "../shell/PaIcon";
import "./listing.css";

const KEY = "pa_filters_open";
const readOpen = () => {
  try { const v = window.localStorage.getItem(KEY); if (v != null) return v === "1"; } catch { /* depolama yok */ }
  return typeof window === "undefined" || window.innerWidth >= 1280;   // varsayılan: ≥1280 açık
};

/** Sayfa iskeleti (v3 Scout C1/C1b): üstte başlık, altında katlanır filtre paneli + sonuçlar.
    Açık: 264px çerçeveli panel. Kapalı: "Filters · N" düğmesi + kaldırılabilir çipler. <768: arama + alt sayfa. */
export function ListingPage({ tint, filters, sheetFilters, search, filterCount = 0, chips = [], onReset, resultLabel, summary, children }) {
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState(readOpen);
  const toggle = () => setOpen((o) => { const n = !o; try { window.localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* yok say */ } return n; });
  const kids = Children.toArray(children);
  const hi = kids.findIndex((k) => k?.type === ListingHero);
  const head = hi >= 0 ? kids.slice(0, hi + 1) : [];
  const rest = hi >= 0 ? kids.slice(hi + 1) : kids;

  return (
    <div className={`pa-list${open ? " fopen" : ""}`} style={{ "--tint": tint }}>
      <section className="pa-list-main">
        <div className="pa-list-body">
          {head}

          {/* Mobil üst şerit: arama + filtre düğmesi, altında aktif çipler */}
          <div className="pa-list-mbar">
            <div className="pa-list-mrow">
              {search}
              <button className="pa-list-fbtn" onClick={() => setSheet(true)} aria-haspopup="dialog">
                Filters {filterCount > 0 && <b>{filterCount}</b>}
              </button>
            </div>
            {chips.length > 0 && <ChipRow chips={chips} />}
          </div>

          <div className="pa-list-split">
            {open && (
              <aside className="pa-list-filters" aria-label="Filters">
                <div className="pa-list-fhead">
                  <span>Filters{filterCount > 0 && <b className="pa-fcount">{filterCount}</b>}</span>
                  <button type="button" className="pa-fcollapse" onClick={toggle} aria-label="Collapse filters" aria-expanded="true">
                    <PaIcon name="chevron" size={16} color="currentColor" />
                  </button>
                </div>
                <div className="pa-list-fbody">{filters}</div>
                {onReset && <button type="button" className="pa-fclear" onClick={onReset} disabled={filterCount === 0}>Clear all</button>}
              </aside>
            )}
            <div className="pa-list-results">
              <div className="pa-list-rbar">
                {!open && (
                  <button type="button" className={`pa-ftoggle${filterCount > 0 ? " on" : ""}`} onClick={toggle} aria-expanded="false">
                    <PaIcon name="menu" size={16} color="currentColor" />Filters{filterCount > 0 ? ` · ${filterCount}` : ""}
                  </button>
                )}
                {!open && chips.length > 0 && <ChipRow chips={chips} />}
                {summary && <span className="pa-rsum">{summary}</span>}
              </div>
              {rest}
            </div>
          </div>
        </div>
      </section>

      {sheet && (
        <Sheet title="Filters" onClose={() => setSheet(false)}
          footer={<>
            {onReset && <Button variant="outline" onClick={onReset}>Clear</Button>}
            <Button variant="primary" onClick={() => setSheet(false)}>{resultLabel || "Show players"}</Button>
          </>}>
          <div className="pa-sheet-body">{sheetFilters || filters}</div>
        </Sheet>
      )}
    </div>
  );
}

function ChipRow({ chips }) {
  return (
    <div className="pa-list-chips">
      {chips.map((c) => (
        <button key={c.key} type="button" className="pa-chip" onClick={c.onClear}
          style={c.color ? { "--c": c.color } : undefined} aria-label={`Remove ${c.label}`}>
          {c.color && <i />}{c.label} <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}

/** Kolon içi etiketli grup. */
export function FilterGroup({ label, children }) {
  return (
    <div className="pa-fgroup">
      <span className="pa-flabel">{label}</span>
      {children}
    </div>
  );
}

/** Alt çizgili select. `big` = sezon gibi ana seçim (20px Rajdhani, aksan). */
export function UnderSelect({ value, onChange, options, big = false, placeholder, label }) {
  return (
    <label className={`pa-uselect${big ? " big" : ""}`}>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <PaIcon name="chevron" size={16} color="var(--text-muted)" />
    </label>
  );
}

/** Alt çizgili arama (masaüstü kolon) / dolgulu arama (mobil şerit). */
export function UnderSearch({ value, onChange, placeholder = "Search player", filled = false }) {
  return (
    <label className={`pa-usearch${filled ? " filled" : ""}`}>
      <PaIcon name="search" size={16} color="var(--text-muted)" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search">×</button>}
    </label>
  );
}

/** Pozisyon hapları — seçili hap sayfa renginde dolar. `grid` = mobil 5'li ızgara. */
export function PillSet({ value, onChange, options, grid = false }) {
  return (
    <div className={`pa-pills${grid ? " grid" : ""}`} role="radiogroup">
      {options.map(o => {
        const [v, l] = Array.isArray(o) ? o : [o, o || "All"];
        const on = value === v;
        return (
          <button key={v || "all"} role="radio" aria-checked={on} className={on ? "on" : ""}
            onClick={() => onChange(v)}>{l}</button>
        );
      })}
    </div>
  );
}

/** Facet listesi: renk noktası + ad + sayı. `chips` = mobil sayfadaki hap biçimi. */
export function FacetList({ items, value, onChange, allLabel = "All archetypes", allCount, chips = false }) {
  const rows = [{ key: "", name: allLabel, count: allCount, color: null }, ...items];
  if (chips) return (
    <div className="pa-facet-chips">
      {rows.map(r => (
        <button key={r.key || "all"} className={value === r.key ? "on" : ""} style={{ "--c": r.color || "#8b857e" }}
          onClick={() => onChange(r.key)}>
          {r.color && <i />}{r.name}
        </button>
      ))}
    </div>
  );
  return (
    <div className="pa-facets">
      {rows.map(r => {
        const on = value === r.key;
        return (
          <button key={r.key || "all"} className={`pa-facet${on ? " on" : ""}${r.count === 0 ? " zero" : ""}`}
            style={{ "--c": r.color || "#ffffff" }} onClick={() => onChange(r.key)} aria-pressed={on}>
            <i className={r.color ? "" : "none"} />
            <span>{r.name}</span>
            {r.count != null && <em>{r.count}</em>}
          </button>
        );
      })}
    </div>
  );
}

/** Sayfa başlığı: (arketip görseli) + eyebrow + 40px başlık + açıklama | sağda sıralama. */
export function ListingHero({ art, eyebrow, title, blurb, aside }) {
  return (
    <header className="pa-list-hero">
      {art && <img className="art" src={art} alt="" aria-hidden="true" />}
      <div className="txt">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {blurb && <p>{blurb}</p>}
      </div>
      {aside && <div className="aside">{aside}</div>}
    </header>
  );
}

/** "Showing X of Y players" + Load more (46px, r23, sayfa renginde halka). */
export function LoadMore({ shown, total, onMore, loading, noun = "players" }) {
  if (!total) return null;
  return (
    <div className="pa-more">
      <span>Showing {shown.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {noun}</span>
      {shown < total && (
        <button onClick={onMore} disabled={loading}>{loading ? "Loading…" : `Load more ${noun}`}</button>
      )}
    </div>
  );
}

/** Kart ızgarası (280px min, 28/24 boşluk). */
export function CardGrid({ children, min = 280 }) {
  return <div className="pa-card-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>;
}
