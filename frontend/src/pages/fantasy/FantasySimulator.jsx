// Tasarım 9 — sezon simülatörü. Draft edilen kadroyu 2026-27 fikstürüyle hafta hafta oynatır.
// Sunucu hesaplar (numpy, Faz 3); istek partilere bölünür: ilerleme çubuğu canlı güncellenir,
// İptal o ana kadarki kısmi sonucu korur. Tasarımdan bilinçli sapma: "Runs on your device" yerine
// sunucu, sezon sayıları 500 / 1,000 / 2,000 (10,000 sezon sunucuda ~1 dk sürerdi).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { BAD, ErrorNote, SkeletonList, ValidationNotice, ordinal } from "./ui";
import RosterSourceBar from "./RosterSourceBar";
import { useFantasy, useIsPhone } from "./useFantasy";
import { useRosterSource } from "./useRosterSource";

const COUNTS = [500, 1000, 2000];
const BATCH = 250;
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const pctText = (p) => `${Math.round(p * 100)}%`;

/** sims-ağırlıklı birleştirme: yeni parti eskisiyle ortalanır (ortalamalar ve olasılıklar). */
function merge(a, b) {
  if (!a) return b;
  const wa = a.sims, wb = b.sims, w = wa + wb;
  const mix = (x, y) => (x * wa + y * wb) / w;
  const arr = (x, y) => x.map((v, i) => mix(v, y[i]));
  const weekly = a.me.weekly.map((wk, i) => {
    const o = b.me.weekly[i];
    return {
      ...wk, games: mix(wk.games, o.games), win_prob: mix(wk.win_prob, o.win_prob), league_games: mix(wk.league_games, o.league_games),
      ...(wk.cats_won != null ? { cats_won: mix(wk.cats_won, o.cats_won), cat_win: arr(wk.cat_win, o.cat_win), league_cats_won: mix(wk.league_cats_won, o.league_cats_won) } : {}),
    };
  });
  return {
    ...b, sims: w,
    me: {
      ...b.me, rank_dist: arr(a.me.rank_dist, b.me.rank_dist), playoff_prob: mix(a.me.playoff_prob, b.me.playoff_prob),
      champion_prob: mix(a.me.champion_prob, b.me.champion_prob), expected_wins: mix(a.me.expected_wins, b.me.expected_wins),
      ...(a.me.category_wins_per_week != null ? { category_wins_per_week: mix(a.me.category_wins_per_week, b.me.category_wins_per_week) } : {}),
      weekly,
    },
  };
}

function heat(p) {
  const i = Math.min(Math.abs(p - 0.5) / 0.35, 1);
  return p >= 0.5 ? `rgba(74,222,128,${0.08 + 0.32 * i})` : `rgba(248,113,113,${0.08 + 0.32 * i})`;
}

function Distribution({ dist, playoffTeams }) {
  const top = Math.max(...dist, 0.01);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="fz-h2">Final standing</span><span className="fz-meta">% of seasons</span>
      </div>
      <div style={{ height: 150, display: "flex", alignItems: "flex-end", gap: 5, boxShadow: "inset 0 -1px 0 #262626" }}>
        {dist.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
            <span className="fz-meta">{v >= 0.005 ? Math.round(v * 100) : ""}</span>
            <div style={{ width: "100%", height: `${Math.max((v / top) * 100 * 0.78, v > 0 ? 2 : 0)}%`, borderRadius: "3px 3px 0 0", background: i < playoffTeams ? "#e5e5e5" : "#3a3a3a" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {dist.map((_, i) => <span key={i} className="fz-meta" style={{ flex: 1, textAlign: "center" }}>{i + 1}</span>)}
      </div>
    </div>
  );
}

function WeekGrid({ agg, phone }) {
  const cats = agg.categories || [];
  const weekly = agg.me.weekly;
  const poFrom = weekly.findIndex((w) => w.playoff);
  const shown = phone ? weekly.slice(Math.max(poFrom, 0)) : weekly;
  const cols = `${phone ? 44 : 48}px repeat(${shown.length}, minmax(0,1fr)) ${phone ? 44 : 56}px`;
  const rows = cats.length
    ? cats.map((c, i) => ({ label: c, cells: shown.map((w) => w.cat_win[i]) }))
    : [{ label: "Win", cells: shown.map((w) => w.win_prob) }];
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const allRows = cats.length ? cats.map((_, i) => weekly.map((w) => w.cat_win[i])) : [weekly.map((w) => w.win_prob)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", paddingBottom: 6 }}>
        <span className="fz-h2">{phone ? (cats.length ? "Playoff weeks by category" : "Playoff weeks · matchup win %") : cats.length ? "Category win probability by week" : "Matchup win probability by week"}</span>
        <span className="fz-meta">
          {cats.length ? "% chance to win the category that week" : "% chance to win the matchup that week"}
          {weekly.some((w) => w.playoff) ? ` · weeks ${weekly.find((w) => w.playoff).week}–${weekly[weekly.length - 1].week} are playoffs` : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 3 }}>
        <span />{shown.map((w) => <span key={w.week} style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: w.playoff ? "#e5e5e5" : "#8a8a8a" }}>{w.week}</span>)}
        <span className="fz-meta" style={{ textAlign: "right" }}>Season</span>
      </div>
      {rows.map((r, ri) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: cols, gap: 3 }}>
          <span className="fz-num" style={{ fontSize: 14, color: "#8a8a8a", display: "flex", alignItems: "center" }}>{r.label}</span>
          {r.cells.map((p, i) => (
            <div key={i} style={{ height: phone ? 34 : 30, borderRadius: 5, background: heat(p), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="fz-num" style={{ fontSize: 13 }}>{Math.round(p * 100)}</span>
            </div>
          ))}
          <span className="fz-num" style={{ fontSize: 15, textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{Math.round(avg(allRows[ri]) * 100)}%</span>
        </div>
      ))}
      {cats.length > 0 && !phone && (
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 3, paddingTop: 6, boxShadow: "inset 0 1px 0 #262626", marginTop: 4 }}>
          <span className="fz-meta" style={{ display: "flex", alignItems: "center" }}>Exp.</span>
          {shown.map((w) => (
            <span key={w.week} className="fz-num" style={{ fontSize: 13, textAlign: "center", paddingTop: 6, color: w.cats_won >= cats.length / 2 + 0.5 ? "#e5e5e5" : w.cats_won < cats.length / 2 ? BAD : "#8a8a8a" }}>{w.cats_won.toFixed(1)}</span>
          ))}
          <span />
        </div>
      )}
      {phone && <span className="fz-meta">Full {weekly.length}-week grid on desktop or rotate your phone.</span>}
    </div>
  );
}

function GamesChart({ weekly }) {
  const max = Math.max(...weekly.map((w) => Math.max(w.games, w.league_games)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="fz-h2">Games per week vs league average</span>
        <span className="fz-meta">Bar = your roster · tick = league average</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
        {weekly.map((w) => (
          <div key={w.week} title={`Week ${w.week}: ${w.games.toFixed(1)} games (league ${w.league_games.toFixed(1)})`}
            style={{ flex: 1, position: "relative", height: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: `${(w.games / max) * 100}%`, background: w.playoff ? "#e5e5e5" : "#5a5a5a", borderRadius: "3px 3px 0 0" }} />
            <div style={{ position: "absolute", left: -1, right: -1, bottom: `${(w.league_games / max) * 100}%`, height: 2, background: "#FFB11B" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {weekly.map((w) => <span key={w.week} className="fz-meta" style={{ flex: 1, textAlign: "center" }}>{w.week}</span>)}
      </div>
    </div>
  );
}

function WeakWeeks({ agg }) {
  const cats = (agg.categories || []).length > 0;
  const rows = [...agg.me.weekly].sort((a, b) => (cats ? a.cats_won - b.cats_won : a.win_prob - b.win_prob)).slice(0, 4).map((w) => ({
    t: `Week ${w.week}${w.playoff ? " · playoffs" : ""}`,
    x: cats ? w.cats_won.toFixed(1) : pctText(w.win_prob),
    why: w.games < w.league_games - 0.5 ? `${Math.round(w.games)} games vs league ${Math.round(w.league_games)}` : cats ? "Category mix, not volume" : "Tougher lineup mix, not volume",
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="fz-h2" style={{ paddingBottom: 6 }}>Weakest weeks</span>
      {rows.map((w) => (
        <div key={w.t} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{w.t}</span><span className="fz-meta">{w.why}</span>
          </div>
          <span className="fz-num" style={{ fontSize: 17 }}>{w.x} <span className="fz-meta" style={{ fontWeight: 600 }}>{cats ? "cats" : "win"}</span></span>
        </div>
      ))}
    </div>
  );
}

export default function FantasySimulator() {
  const f = useFantasy();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const rs = useRosterSource(f, isLoggedIn);
  const { src, body, ctxKey } = rs;
  const [n, setN] = useState(1000);
  const [runState, setRunState] = useState({ key: null, status: "idle", agg: null, done: 0, error: null, eta: null });
  const cancelled = useRef(false);
  const runId = useRef(0);

  const cur = runState.key === ctxKey ? runState : { key: ctxKey, status: "idle", agg: null, done: 0, error: null, eta: null };
  const { status, agg, done, error, eta } = cur;
  useEffect(() => { cancelled.current = true; }, [ctxKey]);   // bağlam değişince süren koşu durur (ref, state değil)

  const run = async () => {
    if (!body) return;
    const my = ++runId.current;
    cancelled.current = false;
    const key = ctxKey;
    const put = (patch) => { if (my === runId.current) setRunState((r) => ({ ...(r.key === key ? r : { key, status: "idle", agg: null, done: 0, error: null, eta: null }), key, ...patch })); };
    put({ status: "running", agg: null, done: 0, error: null, eta: null });
    const base = Math.floor(Math.random() * 1_000_000_000);
    const batches = Math.ceil(n / BATCH);
    let acc = null, total = 0;
    const t0 = performance.now();
    try {
      for (let i = 0; i < batches && !cancelled.current; i += 1) {
        const size = Math.min(BATCH, n - i * BATCH);
        const res = await fz.simulate({ ...body, sims: Math.max(size, 20), seed: base + i });
        if (my !== runId.current || cancelled.current) break;
        acc = merge(acc, res);
        total += res.sims;
        const per = (performance.now() - t0) / (i + 1);
        put({ agg: acc, done: total, eta: Math.max(1, Math.round((per * (batches - i - 1)) / 1000)) });
      }
      put({ status: cancelled.current ? "cancelled" : "done" });
    } catch (e) {
      put({ error: e, status: acc ? "cancelled" : "idle" });
    }
  };
  const cancel = () => { cancelled.current = true; };

  const me = agg?.me;
  const median = me ? (() => { let c = 0; for (let i = 0; i < me.rank_dist.length; i += 1) { c += me.rank_dist[i]; if (c >= 0.5) return i + 1; } return me.rank_dist.length; })() : null;
  const cats = agg?.categories || [];
  const label = status === "running" ? `Early estimate · ${Math.round((done / n) * 100)}% done`
    : status === "cancelled" ? `Cancelled at ${fmtInt(done)} seasons · partial result` : agg ? `${fmtInt(agg.sims)} seasons simulated` : "";

  const controls = (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <RosterSourceBar rs={rs} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="fz-meta">Seasons</span>
        <div className="fz-seg dark">{COUNTS.map((c) => <button key={c} className={n === c ? "on" : ""} onClick={() => setN(c)} disabled={status === "running"}>{fmtInt(c)}</button>)}</div>
      </div>
      <div style={{ flex: 1 }} />
      {status !== "running" && <button className="fz-gold" disabled={!body} onClick={run}>{agg ? "Run again" : "Run simulation"}</button>}
    </div>
  );

  return (
    <>
      <SEO title="Fantasy season simulator" description="Play your drafted roster through the 2026-27 schedule week by week and see playoff odds, title odds and your weakest weeks." path="/basketball/fantasy/simulator" />
      <div className="fz-page" style={{ gap: 26, maxWidth: 1400 }}>
        <div className="fz-head">
          <div className="fz-head-l">
            <h1 className="fz-h1">Season simulator</h1>
            <span className="fz-sub">Plays the 2026-27 schedule week by week against 11 simulated rosters.</span>
          </div>
        </div>
        {controls}
        <ValidationNotice v={agg?.validation} />

        {status === "running" && (
          <div className="fz-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14 }}>Simulating seasons</span>
              <span className="fz-num" style={{ fontSize: 16 }}>{fmtInt(done)} <span style={{ color: "#8a8a8a" }}>/ {fmtInt(n)}</span></span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#1f1f1f", overflow: "hidden" }}>
              <div style={{ width: `${(done / n) * 100}%`, height: "100%", background: "#e5e5e5", transition: "width .2s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span className="fz-meta">Runs on our servers{eta ? ` · about ${eta}s left` : ""} · results below update live</span>
              <button className="fz-btn sm" onClick={cancel}>Cancel</button>
            </div>
          </div>
        )}
        {error && <ErrorNote error={error} onRetry={run} what="the simulation" />}

        {!agg && status !== "running" && !error && (
          <div className="fz-card" style={{ padding: "26px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <span className="fz-h2">{body ? "Ready to simulate" : "No roster to simulate yet"}</span>
            <span className="fz-sub" style={{ lineHeight: 1.55, maxWidth: 560 }}>
              {body
                ? "Press Run simulation to play your roster through every fantasy week. Each batch of seasons draws fresh injuries, hot and cold weeks, and a new set of rival rosters."
                : "Finish a mock draft, fill your roster in the draft assistant, or pick a saved draft. The simulator plays that roster against 11 others."}
            </span>
            {!body && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="fz-btn light" onClick={() => navigate(`/basketball/fantasy/mock${f.query}`)}>Start a mock draft</button>
                <button className="fz-btn" onClick={() => navigate(`/basketball/fantasy/assistant${f.query}`)}>Open the assistant</button>
              </div>
            )}
          </div>
        )}

        {agg && me && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "260px minmax(0,1fr) minmax(0,1fr)", gap: phone ? 26 : 40, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="fz-sub" style={{ fontSize: 13 }}>Playoff odds · top {agg.playoff_teams} of {agg.teams}</span>
                <span className="fz-d" style={{ fontSize: phone ? 60 : 72, lineHeight: 1 }}>{pctText(me.playoff_prob)}</span>
                <span className="fz-meta">{label}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
                  {[["Title odds", pctText(me.champion_prob)], ["Median finish", ordinal(median)],
                    cats.length ? ["Cats won / week", me.category_wins_per_week.toFixed(1)] : ["Expected wins", me.expected_wins.toFixed(1)]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span className="fz-muted">{k}</span><span className="fz-num" style={{ fontSize: 16 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Distribution dist={me.rank_dist} playoffTeams={agg.playoff_teams} />
              <WeakWeeks agg={agg} />
            </div>
            <WeekGrid agg={agg} phone={phone} />
            <GamesChart weekly={me.weekly} />
            <span className="fz-meta" style={{ lineHeight: 1.6, maxWidth: 760 }}>
              Injuries are simulated as one or two multi-game absences plus scattered rest days, sized from real 2023-26 seasons. No waiver or trade moves are made in-season.
              {agg.mode === "simulated_rivals" ? " Rival rosters are drafted by simulated bots, so each batch faces a different league." : ""}
            </span>
          </>
        )}
        {src === "saved" && isLoggedIn && rs.saved === null && <SkeletonList rows={3} height={36} />}
      </div>
    </>
  );
}
