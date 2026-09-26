/* 8a — Discover süzgeçleri rayda (BUILD §23.1: "No filter drawer. The rail
 * is always visible, so filters live there permanently with counts beside
 * each option").
 *
 *   FILTERS · Clear N  ·  SPORT (sayılı)  ·  STAGE Live/Upcoming/Finished
 *   (canlıda nokta)  ·  DATE (sayılı)  ·  MINIMUM HEAT (rampa + "Rated Good or better ·
 *   3.0+")  ·  COMPETITION (ilk iki, "+N more")  ·  SEASON (birden çoksa)
 *
 * Seçili seçenek .06 zemin; altın yalnız seçili SPOR ve TURNUVA adında
 * (tahta). Sayılar uçtan (`/catalog?facets=true`), dışlayıcı: bir boyutun
 * sayıları o boyutun kendi süzgeci dışındaki süzgeçlerle.
 */
import { useState } from "react";
import { activeFilterCount, facetCount, heatFloorLabel } from "./pagesView";
import { DATES } from "../redesign/discoverFilters";

function Option({ label, count, on, onPick, dot = false, gold = false }) {
  return (
    <button type="button" className={`riw-fopt${on ? " is-on" : ""}${gold ? " is-gold" : ""}`} aria-pressed={on} onClick={onPick}>
      {dot && <i className="riw-fopt-dot" aria-hidden="true" />}
      <span>{label}</span>
      {count != null && <small aria-label={`${count} matches`}>{count.toLocaleString()}</small>}
    </button>
  );
}

export default function DiscoverFilters({ filters, facets, onChange, idPrefix = "rail" }) {
  const [allComps, setAllComps] = useState(false);
  const active = activeFilterCount(filters);
  const floor = heatFloorLabel(filters.minHeat);
  const toggle = (key, value) => onChange({ [key]: filters[key] === value ? "All" : value, ...(key === "sport" ? { competition: "All" } : null) });
  const comps = facets?.competition || [];
  const shownComps = allComps ? comps : comps.slice(0, 2);
  // Seçili turnuva ilk ikide değilse de görünsün.
  if (!allComps && filters.competition !== "All" && !shownComps.some((c) => c.value === filters.competition)) {
    shownComps.push({ value: filters.competition, count: facetCount(facets, "competition", filters.competition) });
  }
  const seasons = facets?.season || [];

  return (
    <div className="riw-filters">
      <div className="riw-filters-head">
        <span className="riw-rail-label">FILTERS</span>
        {active > 0 && <button type="button" className="riw-filters-clear" onClick={() => onChange({ sport: "All", status: "All", competition: "All", season: "All", minHeat: null, when: "All" })}>Clear {active}</button>}
      </div>

      <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-sport`}>
        <h3 id={`${idPrefix}-f-sport`} className="riw-rail-label">SPORT</h3>
        {["Football", "Basketball"].map((s) => (
          <Option key={s} label={s} count={facets ? facetCount(facets, "sport", s) : null} on={filters.sport === s} gold onPick={() => toggle("sport", s)} />
        ))}
      </section>

      <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-stage`}>
        <h3 id={`${idPrefix}-f-stage`} className="riw-rail-label">STAGE</h3>
        {[["live", "Live"], ["upcoming", "Upcoming"], ["finished", "Finished"]].map(([v, label]) => (
          <Option key={v} label={label} dot={v === "live"} count={facets ? facetCount(facets, "status", v) : null}
            on={filters.status === v} onPick={() => toggle("status", v)} />
        ))}
      </section>

      {/* Tarih (sahibin isteği): yerel gün, kartın gün etiketiyle aynı sayar.
          Pencereler çakışabilir (bugün hem Today hem Next 7 days). */}
      <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-date`}>
        <h3 id={`${idPrefix}-f-date`} className="riw-rail-label">DATE</h3>
        {DATES.map(([v, label]) => (
          <Option key={v} label={label} count={facets ? facetCount(facets, "when", v) : null}
            on={filters.when === v} onPick={() => toggle("when", v)} />
        ))}
      </section>

      <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-heat`}>
        <h3 id={`${idPrefix}-f-heat`} className="riw-rail-label">MINIMUM HEAT</h3>
        <input type="range" className="riw-heat-range" min={0} max={5} step={0.5} value={filters.minHeat || 0}
          aria-labelledby={`${idPrefix}-f-heat`} aria-valuetext={floor.name ? `${floor.name} or better, ${filters.minHeat}` : "Any heat"}
          onChange={(e) => onChange({ minHeat: Number(e.target.value) || null })} />
        <p className="riw-heat-floor">
          {floor.name ? <>Rated <strong style={{ color: floor.color }}>{floor.name}</strong> or better · {Number(filters.minHeat).toFixed(1)}+</> : floor.text}
        </p>
      </section>

      {comps.length > 0 && (
        <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-comp`}>
          <h3 id={`${idPrefix}-f-comp`} className="riw-rail-label">COMPETITION</h3>
          {shownComps.map((c) => (
            <Option key={c.value} label={c.value} count={c.count} on={filters.competition === c.value} gold onPick={() => toggle("competition", c.value)} />
          ))}
          {comps.length > 2 && (
            <button type="button" className="riw-fopt is-more" aria-expanded={allComps} onClick={() => setAllComps((v) => !v)}>
              <span>{allComps ? "Show fewer" : `+${comps.length - 2} more`}</span>
            </button>
          )}
        </section>
      )}

      {seasons.length > 1 && (
        <section className="riw-fgroup2" aria-labelledby={`${idPrefix}-f-season`}>
          <h3 id={`${idPrefix}-f-season`} className="riw-rail-label">SEASON</h3>
          {seasons.map((s) => (
            <Option key={s.value} label={s.value} count={s.count} on={filters.season === s.value} onPick={() => toggle("season", s.value)} />
          ))}
        </section>
      )}
    </div>
  );
}
