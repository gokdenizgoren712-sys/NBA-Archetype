// Tasarım 4 — Oyuncu fantezi profili: kart, projeksiyon aralıkları, kategori
// katkısı, maç dağılımı ve 2026-27 haftalık program.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import PlayerCard from "../../components/PlayerCard";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import {
  ArchChip, CatBar, ErrorNote, FLAGS, HeatCell, RangeBar, SkeletonList, TREND_NOTE, fmt1,
} from "./ui";
import { useAsync, useFantasy } from "./useFantasy";

const STATS = [
  ["Points", "pts"], ["Rebounds", "reb"], ["Assists", "ast"], ["Steals", "stl"], ["Blocks", "blk"],
  ["3-pointers", "fg3m"], ["Turnovers", "tov"],
];
const PCTS = [["Field goal %", "fg_pct"], ["Free throw %", "ft_pct"]];
const PTS_W = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1 };

function Histogram({ q }) {
  // 41 quantile → 16 kutulu yoğunluk: her quantile aralığı kütlenin 1/40'ı.
  const lo = q[0], hi = q[40];
  const bins = 16, w = (hi - lo) / bins || 1;
  const mass = Array(bins).fill(0);
  for (let i = 0; i < 40; i += 1) {
    const a = q[i], b = q[i + 1];
    for (let k = 0; k < bins; k += 1) {
      const s = lo + k * w, e = s + w;
      const ov = Math.max(0, Math.min(b, e) - Math.max(a, s));
      mass[k] += b > a ? (ov / (b - a)) / 40 : (a >= s && a < e ? 1 / 40 : 0);
    }
  }
  const top = Math.max(...mass) || 1;
  const ceil = q[36];
  const ceilPct = ((ceil - lo) / (hi - lo || 1)) * 100;
  const tick = (i) => Math.round(lo + (i / 5) * (hi - lo));
  return (
    <>
      <div style={{ position: "relative", height: 150, display: "flex", alignItems: "flex-end", gap: 4, boxShadow: "inset 0 -1px 0 #262626" }}>
        {mass.map((m, i) => {
          const mid = lo + (i + 0.5) * w;
          return <div key={i} style={{ flex: 1, height: `${(m / top) * 100}%`, borderRadius: "3px 3px 0 0", background: mid >= ceil ? "#e5e5e5" : "#3a3a3a" }} />;
        })}
        <div style={{ position: "absolute", top: -6, bottom: 0, left: `${ceilPct}%`, borderLeft: "1px dashed #e5e5e5" }}>
          {/* Çizgi sağ yarıdaysa etiket solunda: dar ekranda sağa taşıyordu */}
          <span style={{ position: "absolute", top: -4, ...(ceilPct > 50 ? { right: 8 } : { left: 8 }), fontSize: 12, whiteSpace: "nowrap" }}>
            Ceiling {fmt1(ceil)} · 90th pct
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="fz-meta">
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i}>{tick(i)}</span>)}
      </div>
    </>
  );
}

export default function FantasyPlayer() {
  const { id } = useParams();
  const f = useFantasy();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(
    () => fz.player(id, f.apiFormat, f.apiTeams), JSON.stringify([id, f.apiFormat, f.apiTeams]));
  const sim = data?.simulation;
  const [card, setCard] = useState(null);
  const p = data?.player;

  useEffect(() => {
    setCard(null);
    if (!p || p.source === "rookie_baseline") return;
    api.players({ search: p.name, limit: 5 })
      .then((d) => setCard((d.players || []).find((r) => Number(r.PLAYER_ID) === p.player_id) || (d.players || [])[0] || null))
      .catch(() => setCard(null));
  }, [p?.player_id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <div className="fz-page"><ErrorNote error={error} onRetry={reload} what="this player" /></div>;
  if (loading && !data) return <div className="fz-page"><SkeletonList rows={8} /></div>;
  if (!p) return null;

  const [rlo, rhi] = p.range_factor || [1, 1];
  const isCats = f.kind === "categories";
  const metric = f.isH2H ? "g" : "z";
  const cats = isCats ? Object.entries(p.categories || {}).map(([c, v]) => ({ c, z: v[metric] })) : [];
  const ranked = [...cats].sort((a, b) => b.z - a.z);
  const best = ranked.filter((x) => x.z > 0.3).slice(0, 3).map((x) => x.c);
  const worst = ranked.length ? ranked[ranked.length - 1] : null;
  const pos = p.eligible?.length ? p.eligible.join(",") : "Util";
  const archColor = ARCHETYPE_COLOR[p.archetype] || "#8a8a8a";
  const games = p.proj_gp_range || [];
  const po = (data.schedule || []).filter((w) => w.is_playoff).reduce((a, w) => a + w.games, 0);
  const dist = f.kind === "high_score" ? data.game_distribution?.high_score : data.game_distribution?.points;
  const distLabel = f.kind === "high_score" ? "High Score points" : "Yahoo points";
  const fpByStat = STATS.map(([l, k]) => ({ l, v: (p.per_game[k] || 0) * (PTS_W[k] || 0) })).filter((x) => x.v !== 0);
  const fpMax = Math.max(...fpByStat.map((x) => Math.abs(x.v)), 1);

  const statRows = [
    ...STATS.map(([l, k]) => {
      const v = p.per_game[k];
      return { l, v: fmt1(v), lo: v * rlo, hi: v * rhi, x: v, band: `${fmt1(v * rlo)}–${fmt1(v * rhi)}`, max: Math.max(v * rhi * 1.15, 1) };
    }),
    ...PCTS.map(([l, k]) => ({ l, v: p.per_game[k] != null ? `${(p.per_game[k] * 100).toFixed(1)}%` : "–", x: p.per_game[k], lo: null, hi: null, band: "", max: 1 })),
    { l: "Minutes", v: fmt1(p.proj_mpg), x: p.proj_mpg, lo: null, hi: null, band: "", max: 42 },
  ];

  const flags = (p.flags || []).filter((k) => FLAGS[k]);
  const trendKeys = ["rising", "steady", "declining"];
  const flagText = (k) => (k === "injury_risk" ? `${FLAGS[k].d} We project ${Math.round(p.proj_gp)} games; range ${Math.round(games[0])}–${Math.round(games[1])}.`
    : trendKeys.includes(k) && p.trend_pct != null ? `${FLAGS[k].d} ${p.trend_pct > 0 ? "+" : p.trend_pct < 0 ? "−" : ""}${Math.abs(p.trend_pct)}% a season. ${TREND_NOTE}` : FLAGS[k].d);
  const series = data.trend_series ? Object.entries(data.trend_series) : [];

  return (
    <>
      <SEO title={`${p.name} fantasy`} description={`${p.name} 2026-27 fantasy basketball projection, ranges and schedule.`} path={`/basketball/fantasy/player/${p.player_id}`} />
      <div className="fz-page">
        <button className="fz-link" style={{ alignSelf: "flex-start" }} onClick={() => navigate("/basketball/fantasy/rankings")}>← Rankings</button>
        <div className="fz-player" style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 44 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {card ? <PlayerCard player={{ ...card, overall_tier: card.overall_tier || "" }} rank={p.rank} />
              : (
                <div className="fz-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="fz-meta">{p.source === "rookie_baseline" ? "Rookie" : "No card yet"}</span>
                  <span className="fz-d" style={{ fontSize: 22 }}>{p.name}</span>
                  {data.rookie_baseline && (
                    <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
                      {data.rookie_baseline.draft_pick ? `Pick ${data.rookie_baseline.draft_pick} in ${data.rookie_baseline.draft_year}. ` : "Undrafted. "}
                      Projected from earlier rookies picked {data.rookie_baseline.baseline_bucket === "undrafted" ? "outside the draft" : `in range ${data.rookie_baseline.baseline_bucket}`}.
                    </span>
                  )}
                </div>
              )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="fz-h3">Flags</span>
              {flags.map((k) => (
                <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span className={`fz-flag${FLAGS[k].bad ? " bad" : FLAGS[k].good ? " good" : ""}`} style={{ height: 22, flexShrink: 0 }}>{FLAGS[k].l}</span>
                  <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{flagText(k)}</span>
                </div>
              ))}
              {!flags.length && <span className="fz-sub" style={{ fontSize: 13 }}>No team, role or availability flags.</span>}
              {p.ctx_min_ratio != null && Math.abs(p.ctx_min_ratio - 1) >= 0.03 && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span className="fz-flag" style={{ height: 22, flexShrink: 0 }}>Team context</span>
                  <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>
                    Minutes are adjusted ×{p.ctx_min_ratio.toFixed(2)} for this roster: new teams and deep rotations have been over-projected in past seasons, and teammates who share the ball cost usage.
                  </span>
                </div>
              )}
              {series.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <span className="fz-meta">Fantasy points per 36 minutes</span>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {series.map(([s, v]) => (
                      <span key={s} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span className="fz-num" style={{ fontSize: 16 }}>{fmt1(v)}</span><span className="fz-meta">{s}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 30, minWidth: 0 }}>
            <div className="fz-head">
              <div className="fz-head-l" style={{ gap: 8 }}>
                <h1 className="fz-h1">{p.name}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="fz-sub">{p.team} · {pos}{p.age ? ` · age ${Math.floor(p.age)}` : ""}</span>
                  <ArchChip arch={p.archetype} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 28 }}>
                {[[`Rank · ${f.fmtInfo.short}`, p.rank, "#e5e5e5"], ["ADP", Math.round(p.adp), "#8a8a8a"], ["Games", Math.round(p.proj_gp), "#e5e5e5"]].map(([l, v, c]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span className="fz-meta">{l}</span>
                    <span className="fz-num" style={{ fontSize: 32, lineHeight: 1.1, color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {isCats && p.archetype && (
              <div className="fz-card" style={{ padding: "18px 22px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span className="fz-d" style={{ fontSize: 16, color: archColor, whiteSpace: "nowrap" }}>
                  {p.archetype} → {best.length ? best.join(", ") : "no standout category"}
                </span>
                <span className="fz-sub" style={{ lineHeight: 1.55 }}>
                  {best.length
                    ? `The projection is strongest in ${best.join(", ").replace(/, ([^,]*)$/, " and $1")}`
                    : "The projection sits close to a starter's average across the board"}
                  {worst && worst.z < -0.3 ? ` and costs you ${worst.c}.` : "."}
                  {" "}Values are {metric === "g" ? "G-scores" : "z-scores"} against a {f.t}-team starter pool.
                </span>
              </div>
            )}

            <div className="fz-grid2" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="fz-h2">Projection per game</span><span className="fz-meta">10th–90th pct</span>
                </div>
                {statRows.map((s) => (
                  <div key={s.l} style={{ display: "grid", gridTemplateColumns: "110px 54px minmax(0,1fr) 92px", gap: 12, alignItems: "center", minHeight: 32 }}>
                    <span className="fz-sub" style={{ fontSize: 13 }}>{s.l}</span>
                    <span className="fz-num" style={{ fontSize: 17, textAlign: "right" }}>{s.v}</span>
                    <RangeBar lo={s.lo} hi={s.hi} v={s.x} min={0} max={s.max} />
                    <span className="fz-meta" style={{ textAlign: "right" }}>{s.band}</span>
                  </div>
                ))}
                <span className="fz-meta">Games {Math.round(p.proj_gp)} · range {Math.round(games[0])}–{Math.round(games[1])}</span>
                {sim && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="fz-h2">Team simulation</span><span className="fz-meta">mean · 10th–90th pct</span>
                    </div>
                    {[["Points", "pts"], ["Rebounds", "reb"], ["Assists", "ast"], ["Steals", "stl"], ["Blocks", "blk"], ["3-pointers", "fg3m"], ["Turnovers", "tov"]].map(([l, k]) => {
                      const v = sim.per_game[k];
                      const model = p.per_game[k];
                      return (
                        <div key={k} style={{ display: "grid", gridTemplateColumns: "110px 54px 1fr 92px", gap: 12, alignItems: "center", minHeight: 28 }}>
                          <span className="fz-sub" style={{ fontSize: 13 }}>{l}</span>
                          <span className="fz-num" style={{ fontSize: 17, textAlign: "right" }}>{fmt1(v.mean)}</span>
                          <span className="fz-meta">{model != null && Math.abs(v.mean - model) >= 0.05 ? `model ${fmt1(model)}` : "same as model"}</span>
                          <span className="fz-meta" style={{ textAlign: "right" }}>{fmt1(v.p10)}–{fmt1(v.p90)}</span>
                        </div>
                      );
                    })}
                    <span className="fz-meta" style={{ lineHeight: 1.5 }}>
                      Fantasy points {fmt1(sim.fp.mean)} a game ({fmt1(sim.fp.p10)}–{fmt1(sim.fp.p90)}) · {fmt1(sim.mpg)} minutes · {Math.round(sim.gp)} games. Averages over 100 simulated seasons with injuries, rotation minutes and teammates sharing the ball.
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {isCats ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="fz-h2">Category contributions</span><span className="fz-meta">SD vs a {f.t}-team starter</span>
                    </div>
                    {cats.map(({ c, z }) => <CatBar key={c} cat={c} z={z} />)}
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="fz-h2">Points by stat</span><span className="fz-meta">{fmt1(p.fp_game)} per game</span>
                    </div>
                    {fpByStat.map((x) => (
                      <div key={x.l} className="fz-cbar" style={{ gridTemplateColumns: "90px minmax(0,1fr) 44px" }}>
                        <span className="c" style={{ fontSize: 13, fontFamily: "inherit", fontWeight: 400 }}>{x.l}</span>
                        <div className="fz-track"><span className="fill" style={{ left: 0, width: `${(Math.abs(x.v) / fpMax) * 100}%`, background: x.v >= 0 ? "#4ade80" : "#f87171" }} /></div>
                        <span className="v">{fmt1(x.v)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {dist && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span className="fz-h2">Game-to-game spread</span>
                  <span className="fz-meta">{distLabel} per game · median {fmt1(dist[20])} · shape from the last two seasons, scaled to this projection</span>
                </div>
                <Histogram q={dist} />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span className="fz-h2">2026-27 schedule by fantasy week</span>
                <span className="fz-meta">Playoffs weeks 20–22 · <span style={{ color: "#e5e5e5" }}>{po} games</span></span>
              </div>
              <div className="fz-weeks" style={{ display: "grid", gridTemplateColumns: "repeat(24, minmax(0,1fr))", gap: 4 }}>
                {(data.schedule || []).map((w) => (
                  <div key={w.week} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ width: "100%", borderRadius: 6, boxShadow: w.is_playoff ? "0 0 0 1px #8a8a8a" : "none" }}>
                      <HeatCell w={{ ...w, pending_expected: w.games_expected - w.games }} height={36} />
                    </div>
                    <span className="fz-meta">{w.week}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
