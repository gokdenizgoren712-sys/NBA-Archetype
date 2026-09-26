/* 7g — sezon ısı haritası (BUILD §22.2): "impossible at 375px".
 *
 *   ızgara   132px kulüp sütunu, sonra repeat(N, minmax(0,1fr)), 20px hücre,
 *            3px aralık; satırlar lig tablosu sırasıyla
 *   hücre    o hafta kulübün maçının topluluk ısısı; altın elmas = senin
 *            kaydettiğin gece; oynanmamış .04; 20 puan altı kesikli —
 *            uydurma renk yok
 *   lejant   zorunlu: rampa, altın elmas, kesikli
 *
 * Hücreler etkileşimli değil (38 × 20 kulüp = 760 durak olurdu); her
 * hücrenin okunur bir etiketi var ve fareyle üstüne gelince sayı görünür —
 * ısı hiçbir yerde yalnız renk değil (§6). Veri `GET /competitions/{id}/heatmap`.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rankitApi } from "../rankitApi";
import { RAMP } from "../redesign/heat";
import { PageHead } from "./PageParts";
import { heatCell, weekPlayed } from "./pagesView";

function Legend() {
  return (
    <div className="riw-heat-legend" aria-label="Legend">
      <span className="riw-heat-legend-ramp">
        <small>COLD</small>
        <span aria-hidden="true">{RAMP.map((c) => <i key={c} style={{ background: c }} />)}</span>
        <small className="is-hot">HOT</small>
      </span>
      <span><i className="riw-heat-logged" aria-hidden="true" /><small>YOU LOGGED IT</small></span>
      <span><i className="riw-heat-dashed" aria-hidden="true" /><small>TOO FEW RATINGS</small></span>
    </div>
  );
}

/* Tahtadaki kulüp elması: kendi rengi → %34'ü gece zemine karışmış hâli. */
function swatch(color) {
  const c = /^#[0-9a-f]{3,8}$/i.test(String(color || "").trim()) ? color.trim() : "#3a3f47";
  return `linear-gradient(135deg,${c},color-mix(in oklab,${c} 34%,#090a0b))`;
}

export default function HeatMapPage({ competitionId }) {
  const [data, setData] = useState({ id: null, map: null, error: "" });
  useEffect(() => {
    let alive = true;
    rankitApi.competitionHeatmap(competitionId)
      .then((map) => alive && setData({ id: competitionId, map, error: "" }))
      .catch((e) => alive && setData({ id: competitionId, map: null, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [competitionId]);

  const map = data.id === competitionId ? data.map : null;
  const comp = map?.competition;
  const eyebrow = comp ? [comp.name, comp.season].filter(Boolean).join(" · ").toUpperCase() : "THE SEASON";
  const weeks = map?.weeks || [];
  const clubs = map?.clubs || [];
  const columns = { gridTemplateColumns: `132px repeat(${weeks.length || 1}, minmax(0, 1fr))` };
  const summary = map?.summary;

  return (
    <div className="riw-page riw-heat">
      <PageHead eyebrow={eyebrow} title="The season, by heat"><Legend /></PageHead>

      {data.error && data.id === competitionId && <p className="riw-note riw-page-pad" role="alert">{data.error}</p>}
      {!map && !data.error && <div className="riw-heat-skeleton" aria-busy="true" aria-label="Loading the season" />}

      {map && !map.available && (
        <div className="riw-page-empty">
          <strong>No matchweeks to map</strong>
          <p>This competition does not number its rounds, so there is no week-by-week season to colour.
            {comp?.id ? <> Its table and fixtures are on the <Link to={`/rankit/competition/${comp.id}`}>competition page</Link>.</> : null}</p>
        </div>
      )}

      {map?.available && (
        <div className="riw-heat-body">
          {/* Dar ekranda ızgara yana kayar (min 900) — klavyeyle de kaydırılabilsin. */}
          <div className="riw-heat-scroll" tabIndex={0} role="region" aria-label="Season heat map">
            <div className="riw-heat-grid" role="table" aria-label={`${comp?.name || "Competition"} — heat by club and matchweek`}>
              <div className="riw-heat-row is-head" role="row" style={columns}>
                <span role="columnheader" className="riw-heat-corner">MATCHWEEK</span>
                {weeks.map((week, i) => (
                  <span key={week} role="columnheader" className={`riw-heat-week${weekPlayed(clubs, i) ? "" : " is-future"}`}
                    aria-label={`Matchweek ${week}`}>{week % 2 === 1 ? week : ""}</span>
                ))}
              </div>
              {clubs.map((club) => (
                <div key={club.team.id} className="riw-heat-row" role="row" style={columns}>
                  <span role="rowheader" className="riw-heat-club">
                    <i aria-hidden="true" style={{ background: swatch(club.team.color) }} />
                    <span>{club.team.short_name || club.team.name}</span>
                  </span>
                  {club.cells.map((cell) => {
                    const view = heatCell(cell, club.team.name);
                    return (
                      <span key={cell.week} role="cell" aria-label={view.label} title={view.label}
                        className={`riw-heat-cell is-${view.kind}${view.glow ? " is-glow" : ""}`}
                        style={view.color ? { background: view.color } : undefined}>
                        {cell.logged && <i className="riw-heat-logged" aria-hidden="true" />}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <footer className="riw-heat-foot">
            <p>Each cell is one club's match that week, coloured by what the community made of it. The gold diamond is a night you logged — so the map doubles as a record of what you were watching while the season happened.</p>
            <dl>
              <div><dd className="is-hot">{summary?.hot_weeks ?? 0}</dd><dt>weeks that ran<br />hot league-wide</dt></div>
              <div><dd>{summary?.best_week ? `MW ${summary.best_week.week}` : "—"}</dd><dt>best weekend<br />of the season</dt></div>
              <div><dd className="is-logged">{summary?.logged ?? 0}</dd><dt>of these<br />you logged</dt></div>
            </dl>
          </footer>
        </div>
      )}
    </div>
  );
}
