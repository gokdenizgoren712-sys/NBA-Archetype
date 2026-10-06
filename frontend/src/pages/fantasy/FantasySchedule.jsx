// Tasarım 10 — 2026-27 fikstür planlayıcı: takım × fantezi haftası ısı haritası.
import { useState } from "react";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { BAD, ErrorNote, GOOD, HeatCell, SkeletonList } from "./ui";
import { useAsync, useIsPhone } from "./useFantasy";

const MODES = [["g", "Total games"], ["b2b", "Back-to-backs"], ["light", "Light-day games"]];
const RANGES = [[0, 6, "W1–6"], [6, 12, "W7–12"], [12, 18, "W13–18"], [18, 24, "W19–24"]];
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function PoList({ title, list, color, max }) {
  return (
    <div className="fz-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="fz-sub" style={{ fontSize: 13 }}>{title}</span>
      {list.map((r) => (
        <div key={r.t} style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) 24px", gap: 10, alignItems: "center" }}>
          <span className="fz-num" style={{ fontSize: 15 }}>{r.t}</span>
          <div style={{ height: 6, borderRadius: 3, background: "#1f1f1f" }}><div style={{ height: "100%", width: `${(r.po / max) * 100}%`, borderRadius: 3, background: color }} /></div>
          <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{r.po}</span>
        </div>
      ))}
    </div>
  );
}

export default function FantasySchedule() {
  const phone = useIsPhone();
  const [mode, setMode] = useState("g");
  const [range, setRange] = useState(3);
  const [allTeams, setAllTeams] = useState(false);
  const { data, error, loading, reload } = useAsync(() => fz.schedule(), "schedule");

  if (error && !data) return <div className="fz-page"><ErrorNote error={error} onRetry={reload} what="the schedule" /></div>;
  if (loading && !data) return <div className="fz-page"><SkeletonList rows={10} height={30} /></div>;

  const weeks = data.weeks;
  const playoffWeeks = weeks.filter((w) => w.is_playoff);
  const poSet = new Set(playoffWeeks.map((w) => w.week));
  const rows = Object.entries(data.teams).map(([t, ws]) => ({
    t, ws, po: ws.filter((w) => poSet.has(w.week)).reduce((a, w) => a + w.games, 0),
  })).sort((a, b) => a.t.localeCompare(b.t));
  const byPo = [...rows].sort((a, b) => b.po - a.po || a.t.localeCompare(b.t));
  const maxPo = byPo[0]?.po || 1;
  const poAvg = rows.reduce((a, r) => a + r.po, 0) / (rows.length || 1);
  const cupWeeks = new Set(rows[0]?.ws.filter((w) => w.pending_expected > 0.01).map((w) => w.week));
  const asWeek = weeks.find((w) => w.all_star_merged);
  const tag = (w) => (w.is_playoff ? "PO" : w.all_star_merged ? "ASB" : cupWeeks.has(w.week) ? "Cup" : "");
  const first = playoffWeeks[0], last = playoffWeeks[playoffWeeks.length - 1];


  const [a0, a1] = RANGES[range];
  const phoneRows = (range === 3 ? byPo : rows).slice(0, allTeams ? 30 : 14);

  return (
    <>
      <SEO title="Fantasy schedule 2026-27" description="Games per fantasy week for every NBA team, back-to-backs and fantasy playoff weeks." path="/basketball/fantasy/schedule" />
      <div className="fz-page" style={{ gap: 22, maxWidth: 1400 }}>
        <div className="fz-head">
          <div className="fz-head-l">
            <p className="pa-eyebrow">Fantasy · Schedule</p>
        <h1 className="fz-h1">2026-27 schedule</h1>
            <span className="fz-sub">
              {weeks.length} fantasy weeks{asWeek ? ` · week ${asWeek.week} is the double All-Star week` : ""}
              {first ? ` · playoffs weeks ${first.week}–${last.week} (${fmtDay(first.start)} – ${fmtDay(last.end)})` : ""}
            </span>
          </div>
          <div className={`fz-seg${phone ? " scroll" : ""}`}>
            {MODES.map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}
          </div>
        </div>

        {!phone ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)", gap: 14 }}>
            <PoList title="Most playoff games" list={byPo.slice(0, 5)} color={GOOD} max={maxPo} />
            <PoList title="Fewest playoff games" list={byPo.slice(-5).reverse()} color={BAD} max={maxPo} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 4px" }}>
              <span className="fz-h2">Playoff weeks summary</span>
              <span className="fz-sub" style={{ lineHeight: 1.55 }}>
                <span style={{ color: "#e5e5e5" }}>{byPo[byPo.length - 1].t}</span> gets {byPo[byPo.length - 1].po} games across weeks {first?.week}–{last?.week} while{" "}
                <span style={{ color: "#e5e5e5" }}>{byPo[0].t}</span> gets {byPo[0].po}; league average {poAvg.toFixed(1)}.
                In points and High Score formats every extra game is another chance to score.
              </span>
              {cupWeeks.size > 0 && (
                <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Week{cupWeeks.size > 1 ? "s" : ""} {[...cupWeeks].join(" and ")} (NBA Cup): each team has 2 undated games. Cells show expected games, dotted underline.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="fz-card" style={{ padding: "14px 16px", fontSize: 14, lineHeight: 1.5, color: "#8a8a8a" }}>
            Playoffs W{first?.week}–{last?.week}: <span style={{ color: "#e5e5e5" }}>{byPo[0].t} {byPo[0].po}</span> games,{" "}
            <span style={{ color: "#e5e5e5" }}>{byPo[byPo.length - 1].t} {byPo[byPo.length - 1].po}</span>. League avg {poAvg.toFixed(1)}.
          </div>
        )}

        {!phone ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${weeks.length}, minmax(28px,1fr))`, gap: 3, height: 18 }}>
              <span />{weeks.map((w) => <span key={w.week} className="fz-meta" style={{ textAlign: "center", color: w.is_playoff ? "#e5e5e5" : "#8a8a8a" }}>{tag(w)}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${weeks.length}, minmax(28px,1fr))`, gap: 3, paddingBottom: 4 }}>
              <span />{weeks.map((w) => (
                <span key={w.week} title={`${fmtDay(w.start)} – ${fmtDay(w.end)}`}
                  style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: w.is_playoff ? "#e5e5e5" : "#8a8a8a" }}>{w.week}</span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.t} style={{ display: "grid", gridTemplateColumns: `48px repeat(${weeks.length}, minmax(28px,1fr))`, gap: 3 }}>
                <span className="fz-num" style={{ fontSize: 14, display: "flex", alignItems: "center" }}>{r.t}</span>
                {r.ws.map((w) => <HeatCell key={w.week} w={w} mode={mode} />)}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
              {RANGES.map(([, , l], i) => (
                <button key={l} className={`fz-btn${i === range ? " light" : ""}`} style={{ height: 44 }} onClick={() => setRange(i)}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "grid", gridTemplateColumns: "48px repeat(6, minmax(0,1fr)) 36px", gap: 3, paddingBottom: 4 }}>
                <span />{weeks.slice(a0, a1).map((w) => <span key={w.week} style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: w.is_playoff ? "#e5e5e5" : "#8a8a8a" }}>{w.week}</span>)}
                <span className="fz-meta" style={{ textAlign: "right" }}>PO</span>
              </div>
              {phoneRows.map((r) => (
                <div key={r.t} style={{ display: "grid", gridTemplateColumns: "48px repeat(6, minmax(0,1fr)) 36px", gap: 3 }}>
                  <span className="fz-num" style={{ fontSize: 14, display: "flex", alignItems: "center" }}>{r.t}</span>
                  {r.ws.slice(a0, a1).map((w) => <HeatCell key={w.week} w={w} mode={mode} height={36} />)}
                  <span className="fz-num" style={{ fontSize: 15, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{r.po}</span>
                </div>
              ))}
              {!allTeams && <button className="fz-btn" style={{ marginTop: 10 }} onClick={() => setAllTeams(true)}>Show all 30 teams</button>}
            </div>
          </>
        )}
        <span className="fz-meta">Games count sets the tint · two dots = has a back-to-back · light days = 7 or fewer NBA games that day.</span>
      </div>
    </>
  );
}
