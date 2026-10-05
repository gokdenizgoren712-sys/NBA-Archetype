// Tasarım 14 — Yöntem ve doğruluk. Metin gerçek yöntemi anlatır (mockup'taki
// örnek metin modeli yanlış tarif ediyordu); rakamlar /api/fantasy/backtest'ten.
import { useState } from "react";
import PaIcon from "../../components/shell/PaIcon";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { useAsync, useIsPhone } from "./useFantasy";

const SECTIONS = [
  { id: "projections", h: "Projections", p: [
    "Each player's per-minute production comes from the last three seasons of game logs, weighted 7:2:1 toward the most recent. We tested 5:3:2, 6:3:1, 5:4:3 and 7:2:1 on the 2024-25 season; in the NBA the latest season carries most of the signal.",
    "Players with little court time are pulled toward the average for their position group (guards, forwards, centers), harder for noisy stats like steals and blocks. Rates then move along an age curve fit to every player since 2013-14, so a 21-year-old gains and a 33-year-old gives some back.",
    "Minutes and games played come from each player's own history pulled toward the league average. Young players' minutes growth is capped by how far they are from a starter's load. Rookies are projected from the first seasons of earlier rookies drafted in the same range of picks.",
    "Then a team-context layer adjusts for the roster a player actually joins. Players on a new team and players deep in a crowded rotation had been over-projected (about 10% on new teams), so minutes are trimmed using team minutes, rotation rank and age. Usage, rebounds and assists also move with how much the teammates take: we measured how a player's rates changed when he switched teams (usage elasticity about 0.8, rebounds about 0.5, assists about 0.55). Tested on 2023-26 with each season held out, it cut fantasy-point error by 3% and the average over-projection by about half.",
  ] },
  { id: "simulation", h: "Model vs simulation", p: [
    "The simulation is a second, independent projection. It plays every team through 100 seasons of 82 games. Each season draws injuries and a good or bad year for every player; in each game it hands out minutes among the players who are actually on the floor, then shares shots, rebounds and assists using how much the teammates on the floor take. When a star sits, the others' shares rise in that game.",
    "We checked it on 2023-26 with each season held out. Fantasy-point error fell in all three seasons and the average over-projection dropped to under a tenth of a point; the 10th to 90th percentile bands held the real result about 80% of the time. It lands very close to the model (correlation 0.99), so use it as a second opinion: where the two differ, the roster is doing something the player's own history cannot see. The simulation view is built for the pre-season rosters and switches off once the season starts.",
  ] },
  { id: "trend", h: "Rising, steady, declining", p: [
    "Each veteran with at least two seasons of 400+ minutes gets a direction label. We take fantasy points per 36 minutes in each of the last four seasons, fit a line weighted by minutes played, and call a player Rising or Declining when it moves more than 4% a season. Rookies and one-season players get no label.",
    "The label describes the path, it does not change the projection. We checked it on 2023-26: it explains almost none of the gap between projection and what happened (correlation 0.07), because the projection already leans on the last three seasons and an age curve.",
  ] },
  { id: "gscore", h: "G-score vs z-score", p: [
    "Z-score measures how far a player is above average in each category, in standard deviations. It is the right tool for Roto, where totals accumulate over a season.",
    "G-score also accounts for how much a category swings week to week. Steals and blocks are noisy in any single week, so an edge there wins fewer head-to-head matchups than the same edge in points. We follow Rosenof's definition; for H2H we default to G-score and you can switch.",
  ] },
  { id: "adp", h: "How ADP is modeled", p: [
    "ADP is Yahoo's real average draft position from their preseason drafts, copied from their site (last update 5 Oct). Players Yahoo has too few drafts for, and players it doesn't list, fall back to our own estimate: last season's per-game production, measured the way your format scores it. “vs ADP” shows where our ranking disagrees with the market: where you can wait and where you'd be reaching.",
    "Availability percentages simulate the picks before yours with that ADP plus noise that grows with draft position. Once Yahoo leagues can be connected, ADP will refresh on its own.",
  ] },
];

const LIMITS = [
  "Trades and signings after the last roster refresh aren't reflected until the next update. The date is in the top bar.",
  "Minutes for players who changed teams follow their previous role; we don't read depth charts.",
  "Games played is the hardest number to predict (injuries). Ranges show it: durable players project within about half to 1.15× their estimate, injury-prone players far wider.",
  "Rookies are projected from draft slot only, so their ranges are wide. Comparables-based rookie projections are planned.",
  "Position eligibility and the ADP list are copied from Yahoo's site by hand, not read from your league. They refresh when we update, and live once Yahoo leagues can be connected.",
  "We have no injury news. A player coming off a long injury is valued from his games-played history alone, so he can sit well below Yahoo's ranking until you check his status.",
  "Each team's two NBA Cup games without a date yet are spread as expected games over the Cup weeks.",
];

const STAT_ROWS = [["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"], ["STL", "STL"], ["BLK", "BLK"], ["3PM", "FG3M"],
                   ["TO", "TOV"], ["FG%", "FG%"], ["FT%", "FT%"], ["Minutes", "MIN"], ["Games", "GP"]];

export default function FantasyMethodology() {
  const phone = useIsPhone();
  const [toc, setToc] = useState(false);
  const { data } = useAsync(() => fz.backtest(), "backtest");
  const test = data ? Object.entries(data.folds).find(([, v]) => v.role === "test") : null;
  const [season, fold] = test || [];
  const sum = data?.summary?.[season];
  const base = fold?.baseline_last_season?.FP;
  const updated = data?.generated_at ? new Date(data.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  const nav = [...SECTIONS.map((s) => [s.id, s.h]), ["backtest", "Backtest"], ["limits", "Known limitations"]];
  const go = (id) => { document.getElementById(`fz-m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); setToc(false); };
  const pStyle = { margin: 0, fontSize: phone ? 15 : 16, lineHeight: phone ? 1.65 : 1.7, color: "var(--fz-read)", textWrap: "pretty" };

  return (
    <>
      <SEO title="Fantasy methodology" description="How our basketball fantasy projections, G-scores and ADP work, and how accurate they were." path="/basketball/fantasy/methodology" />
      <div className="fz-page" style={{ maxWidth: "none", alignItems: "center", paddingTop: phone ? 22 : 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "200px minmax(0,680px)", gap: phone ? 26 : 64, width: "100%", justifyContent: "center" }}>
          {!phone && (
            <nav style={{ position: "sticky", top: 96, alignSelf: "start", display: "flex", flexDirection: "column", gap: 2 }} aria-label="On this page">
              <span className="fz-meta" style={{ paddingBottom: 8 }}>On this page</span>
              {nav.map(([id, l]) => (
                <button key={id} onClick={() => go(id)} style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 8, border: 0, background: "transparent", color: "#8a8a8a", fontSize: 14, cursor: "pointer", textAlign: "left" }}>{l}</button>
              ))}
            </nav>
          )}
          <article style={{ display: "flex", flexDirection: "column", gap: phone ? 26 : 36, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h1 className="fz-h1" style={phone ? { lineHeight: 1.05 } : undefined}>How our fantasy numbers work</h1>
              {updated && <span className="fz-sub" style={{ fontSize: phone ? 13 : 14 }}>Backtest run {updated}</span>}
            </div>
            {phone && (
              <div>
                <button className="fz-card" onClick={() => setToc((t) => !t)} style={{ width: "100%", height: 48, padding: "0 14px", border: 0, color: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                  On this page <PaIcon name="chevron" size={16} color="#8a8a8a" />
                </button>
                {toc && nav.map(([id, l]) => <button key={id} className="fz-row" onClick={() => go(id)} style={{ width: "100%", height: 44, border: 0, background: "none", color: "#e5e5e5", textAlign: "left", fontSize: 14 }}>{l}</button>)}
              </div>
            )}
            {SECTIONS.map((s) => (
              <section key={s.id} id={`fz-m-${s.id}`} style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 80 }}>
                <h2 className="fz-d" style={{ margin: 0, fontSize: phone ? 21 : 24 }}>{s.h}</h2>
                {s.p.map((t) => <p key={t.slice(0, 20)} style={pStyle}>{t}</p>)}
              </section>
            ))}

            <section id="fz-m-backtest" style={{ display: "flex", flexDirection: "column", gap: 14, scrollMarginTop: 80 }}>
              <h2 className="fz-d" style={{ margin: 0, fontSize: phone ? 21 : 24 }}>Backtest: {season || "last season"} projected vs actual</h2>
              <p style={pStyle}>
                We projected {season || "the last season"} using only games played before it and compared per game for every player with 20+ games.
                The settings were chosen on the season before and not touched for this test.
                {base && fold?.model?.FP ? ` Error in Yahoo points per game was ${fold.model.FP.mae.toFixed(2)}, against ${base.mae.toFixed(2)} for simply repeating each player's previous season.` : ""}
              </p>
              {sum && (
                <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr 1fr" : "repeat(3,1fr)", gap: phone ? 8 : 10 }}>
                  <div className="fz-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="fz-meta">Value correlation</span>
                    <span className="fz-num" style={{ fontSize: 30 }}>{sum.fp_corr?.toFixed(2)}</span>
                  </div>
                  <div className="fz-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="fz-meta">Inside 10–90 band</span>
                    <span className="fz-num" style={{ fontSize: 30 }}>{Math.round((sum.band_coverage_out_of_sample ?? sum.band_coverage) * 100)}% <span style={{ fontSize: 14, color: "#8a8a8a" }}>target 80</span></span>
                  </div>
                  <div className="fz-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 2, gridColumn: phone ? "span 2" : "auto" }}>
                    <span className="fz-meta">Top {sum.top_n} → finished top {sum.within_n}</span>
                    <span className="fz-num" style={{ fontSize: 30 }}>{sum.top50_in_top75} <span style={{ fontSize: 14, color: "#8a8a8a" }}>of {sum.top_n}</span></span>
                  </div>
                </div>
              )}
              {sum?.band_coverage_out_of_sample != null ? (
                <span className="fz-meta" style={{ lineHeight: 1.5 }}>The band's width comes from the season before, then is tested on this one, so the coverage figure is out-of-sample. It runs a few points under the 80% target: the bands are slightly narrow.</span>
              ) : sum?.band_coverage_in_sample && (
                <span className="fz-meta" style={{ lineHeight: 1.5 }}>The band's width is itself set from these test seasons, so the coverage figure is in-sample and slightly flattering.</span>
              )}
              {fold && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "80px minmax(0,1fr) 60px 80px", gap: 14, height: 34, alignItems: "center", boxShadow: "inset 0 -1px 0 #262626", fontSize: 12, color: "#8a8a8a" }}>
                    <span>Stat</span><span>Correlation</span><span style={{ textAlign: "right" }}>r</span><span style={{ textAlign: "right" }}>Mean error</span>
                  </div>
                  {STAT_ROWS.filter(([, k]) => fold.model[k]?.corr != null).map(([l, k]) => {
                    const m = fold.model[k];
                    const pctStat = k === "FG%" || k === "FT%";
                    return (
                      <div key={k} className="fz-row" style={{ display: "grid", gridTemplateColumns: "80px minmax(0,1fr) 60px 80px", gap: 14, minHeight: 40, alignItems: "center" }}>
                        <span className="fz-num" style={{ fontSize: 15 }}>{l}</span>
                        <div style={{ height: 6, borderRadius: 3, background: "#1f1f1f" }}><div style={{ height: "100%", width: `${Math.max(0, m.corr) * 100}%`, borderRadius: 3, background: "#8a8a8a" }} /></div>
                        <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{m.corr.toFixed(2)}</span>
                        <span className="fz-sub" style={{ fontSize: 13, textAlign: "right" }}>{pctStat ? `${(m.mae * 100).toFixed(1)} pts` : m.mae.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section id="fz-m-limits" style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 80 }}>
              <h2 className="fz-d" style={{ margin: 0, fontSize: phone ? 21 : 24 }}>Known limitations</h2>
              {LIMITS.map((l) => (
                <div key={l.slice(0, 20)} style={{ display: "flex", gap: 12 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: "#8a8a8a", marginTop: 11, flexShrink: 0 }} />
                  <span style={{ ...pStyle }}>{l}</span>
                </div>
              ))}
            </section>
          </article>
        </div>
      </div>
    </>
  );
}
