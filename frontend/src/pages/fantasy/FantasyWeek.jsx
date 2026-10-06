// Tasarım 11 — Bu hafta: rakibe karşı eşleşme (kategori / puan), High Score haftalık kadro ve streamer listesi.
// Sunucu (Faz 4): aynı sezon simülasyonundan tek hafta; serbest oyuncu = ligdeki hiçbir kadroda olmayan havuz oyuncusu.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import RosterSourceBar from "./RosterSourceBar";
import { BAD, ErrorNote, GOOD, SkeletonList, ValidationNotice, fmt1, pct } from "./ui";
import { useAsync, useFantasy, useIsPhone } from "./useFantasy";
import { useRosterSource } from "./useRosterSource";

const SIMS = 300;
const SEED = 3;
const LEAGUE_SEED = 1;
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const heat = (p) => {
  const i = Math.min(Math.abs(p - 0.5) / 0.4, 1);
  return p >= 0.5 ? `rgba(74,222,128,${0.08 + 0.3 * i})` : `rgba(248,113,113,${0.08 + 0.3 * i})`;
};
const showCat = (c, v) => (c === "FG%" || c === "FT%" ? v.toFixed(3).replace(/^0/, "") : Math.round(v));

function MatchupCard({ a, kind, phone, opp }) {
  const m = a.matchup;
  const cats = m.categories || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="fz-meta">Matchup</span>
          <span className="fz-d" style={{ fontSize: 22 }}>You vs Team {opp}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
          <span className="fz-meta">{kind === "categories" ? "Expected cats" : "Expected points"}</span>
          <span className="fz-num" style={{ fontSize: 26 }}>
            {kind === "categories" ? m.exp_cats[0].toFixed(1) : Math.round(m.exp_points[0]).toLocaleString("en-US")}
            <span style={{ color: "#8a8a8a", fontSize: 18 }}> – {kind === "categories" ? m.exp_cats[1].toFixed(1) : Math.round(m.exp_points[1]).toLocaleString("en-US")}</span>
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span className="fz-muted">Your games <span className="fz-num" style={{ color: "#e5e5e5", fontSize: 15 }}>{a.games[0].toFixed(0)}</span> · Theirs <span className="fz-num" style={{ color: "#e5e5e5", fontSize: 15 }}>{a.games[1].toFixed(0)}</span></span>
        <span className="fz-muted">Win the week <span className="fz-num" style={{ color: m.win_prob >= 0.5 ? GOOD : BAD, fontSize: 15 }}>{pct(m.win_prob)}</span></span>
      </div>
      {cats.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "grid", gridTemplateColumns: `52px repeat(2, minmax(0,1fr)) ${phone ? 64 : 110}px`, gap: 10, fontSize: 12, color: "#8a8a8a", paddingBottom: 2 }}>
            <span /><span style={{ textAlign: "right" }}>You</span><span style={{ textAlign: "right" }}>Team {opp}</span><span style={{ textAlign: "right" }}>Win odds</span>
          </div>
          {cats.map((c) => (
            <div key={c.cat} style={{ display: "grid", gridTemplateColumns: `52px repeat(2, minmax(0,1fr)) ${phone ? 64 : 110}px`, gap: 10, alignItems: "center", minHeight: 34 }}>
              <span className="fz-num" style={{ fontSize: 14, color: m.swing.includes(c.cat) ? "#FFB11B" : "#8a8a8a" }}>{c.cat}</span>
              <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{showCat(c.cat, c.me)}</span>
              <span className="fz-num" style={{ fontSize: 15, textAlign: "right", color: "#8a8a8a" }}>{showCat(c.cat, c.opp)}</span>
              <div style={{ height: 26, borderRadius: 6, background: heat(c.win), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="fz-num" style={{ fontSize: 14 }}>{Math.round(c.win * 100)}%</span>
              </div>
            </div>
          ))}
          <span className="fz-sub" style={{ fontSize: 13, paddingTop: 8, lineHeight: 1.5 }}>
            {m.swing.length
              ? <>Swing categories this week: <span style={{ color: "#FFB11B" }}>{m.swing.join(", ")}</span>. Streamers below target them.</>
              : "No category is a toss-up this week: the matchup is mostly decided."}
          </span>
        </div>
      )}
    </div>
  );
}

function Lineup({ a, start, setStart }) {
  const L = a.lineup;
  const byId = Object.fromEntries(a.players.map((p) => [p.player_id, p]));
  const ranked = [...a.players].sort((x, y) => y.ceiling - x.ceiling);
  const total = start.reduce((s, id) => s + (byId[id]?.ceiling || 0), 0);
  const gap = L.best_total - total;
  const toggle = (id) => setStart(start.includes(id) ? start.filter((x) => x !== id) : start.length < L.starters ? [...start, id] : start);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="fz-h2">Weekly lineup · {start.length} of {L.starters} starters</span>
          <span className="fz-meta">Ranked by ceiling</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span className="fz-meta">Expected score</span>
          <span className="fz-num" style={{ fontSize: 26 }}>{Math.round(total).toLocaleString("en-US")}</span>
        </div>
      </div>
      {gap > 0.5 ? (
        <div className="fz-notice" style={{ justifyContent: "space-between" }}>
          <span>{Math.round(gap)} points below the best lineup.</span>
          <button className="fz-btn sm light" onClick={() => setStart(L.best)}>Set best lineup</button>
        </div>
      ) : <span className="fz-meta">This is the best lineup for the week.</span>}
      <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 46px 64px 78px", gap: 8, fontSize: 12, color: "#8a8a8a", paddingTop: 4 }}>
        <span /><span>Player</span><span style={{ textAlign: "right" }}>Games</span><span style={{ textAlign: "right" }} title="Expected best single game this week">Ceiling</span><span />
      </div>
      {ranked.map((p, i) => {
        const on = start.includes(p.player_id);
        return (
          <div key={p.player_id} className="fz-row" style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 46px 64px 78px", gap: 8, alignItems: "center", minHeight: 48, opacity: on ? 1 : 0.6 }}>
            <span className="fz-num fz-muted" style={{ fontSize: 14 }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span className="fz-meta">{p.team} · {p.eligible.join(",") || "Util"}</span>
            </span>
            <span className="fz-num" style={{ fontSize: 15, textAlign: "right", color: p.games >= 4 ? GOOD : "#e5e5e5" }}>{p.games}</span>
            <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{fmt1(p.ceiling, 0)}</span>
            <button className={`fz-btn sm${on ? " light" : ""}`} onClick={() => toggle(p.player_id)} aria-pressed={on}>{on ? "Start" : "Bench"}</button>
          </div>
        );
      })}
      <span className="fz-meta" style={{ lineHeight: 1.5 }}>Ceiling = expected single best game this week. More games = more chances at a big one.{a?.engine === "world" ? " Taken from the team simulation, so it already counts injuries and how many shots teammates take." : ""}</span>
    </div>
  );
}

function Streamers({ a, kind, fourOnly, setFourOnly }) {
  const rows = a.free_agents.filter((p) => !fourOnly || p.games >= 4).slice(0, 15);
  const swing = kind === "categories" ? a.matchup.swing : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="fz-h2">Streaming and waivers</span>
          <span className="fz-meta">Free agents ranked by games this week{swing.length ? ` and ${swing.join(", ")}` : ""}</span>
        </div>
        <button className={`fz-btn sm${fourOnly ? " light" : ""}`} aria-pressed={fourOnly} onClick={() => setFourOnly(!fourOnly)}>4+ games only</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 46px 86px 70px", gap: 8, fontSize: 12, color: "#8a8a8a" }}>
        <span>Player</span><span style={{ textAlign: "right" }}>Games</span>
        <span>{kind === "categories" ? "Helps" : ""}</span>
        <span style={{ textAlign: "right" }} title={kind === "categories" ? "Advantage over a typical free agent this week" : "Expected this week"}>{kind === "categories" ? "Edge" : kind === "high_score" ? "Ceiling" : "Exp. pts"}</span>
      </div>
      {rows.length === 0 && <span className="fz-sub" style={{ padding: "12px 0" }}>No free agent matches. Turn off the 4+ games filter.</span>}
      {rows.map((p) => (
        <div key={p.player_id} className="fz-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 46px 86px 70px", gap: 8, alignItems: "center", minHeight: 48 }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            <span className="fz-meta">{p.team} · {p.eligible.join(",") || "Util"}</span>
          </span>
          <span className="fz-num" style={{ fontSize: 15, textAlign: "right", color: p.games >= 4 ? GOOD : "#e5e5e5" }}>{p.games}</span>
          <span className="fz-meta" style={{ color: "#e5e5e5" }}>{(p.helps || []).join(" · ")}</span>
          <span className="fz-num" style={{ fontSize: 15, textAlign: "right" }}>{kind === "categories" ? `${p.week_value > 0 ? "+" : ""}${p.week_value.toFixed(1)}` : Math.round(p.week_value)}</span>
        </div>
      ))}
      <span className="fz-meta" style={{ lineHeight: 1.5 }}>Add players in your Yahoo league. This page only ranks them. Free agents here are everyone not on a roster in the league shown above.</span>
    </div>
  );
}

export default function FantasyWeek() {
  const f = useFantasy();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const rs = useRosterSource(f, isLoggedIn);
  const { body, ctxKey } = rs;
  const sched = useAsync(() => fz.schedule(), "schedule");
  const [weekPick, setWeekPick] = useState(null);
  const [oppPick, setOppPick] = useState({ key: null, v: null });
  const [league, setLeague] = useState({ key: null, data: null, error: null });
  const [resRaw, setResRaw] = useState({ key: null, data: null, error: null });
  const [lineupRaw, setLineupRaw] = useState({ key: null, start: null });
  const [fourOnly, setFourOnly] = useState(false);
  const seq = useRef(0);

  const weeks = sched.data?.weeks || [];
  const today = new Date().toISOString().slice(0, 10);
  const nowWeek = weeks.find((w) => w.start <= today && today <= w.end)?.week || 1;
  const maxWeek = weeks.filter((w) => w.week <= 22).length || 22;
  const week = Math.min(weekPick ?? nowWeek, maxWeek);

  useEffect(() => {
    if (!body) return undefined;
    let live = true;
    fz.leagueRosters({ ...body, league_seed: LEAGUE_SEED })
      .then((data) => { if (live) setLeague({ key: ctxKey, data, error: null }); })
      .catch((error) => { if (live) setLeague({ key: ctxKey, data: null, error }); });
    return () => { live = false; };
  }, [ctxKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const lg = league.key === ctxKey ? league : { data: null, error: null };
  const others = Object.keys(lg.data?.rosters || {}).map(Number).filter((t) => t !== body?.slot).sort((a, b) => a - b);
  const opp = (oppPick.key === ctxKey ? oppPick.v : null) ?? others[0] ?? null;

  const anaKey = body && opp ? JSON.stringify([ctxKey, week, opp]) : null;
  useEffect(() => {
    if (!anaKey) return undefined;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const data = await fz.week({ ...body, league_seed: LEAGUE_SEED, week, opponent: opp, sims: SIMS, seed: SEED });
        if (my === seq.current) setResRaw({ key: anaKey, data, error: null });
      } catch (error) {
        if (my === seq.current) setResRaw({ key: anaKey, data: null, error });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [anaKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const res = resRaw.key === anaKey ? resRaw : { data: null, error: null };
  const a = res.data;
  const kind = a?.kind;
  const start = a?.lineup ? (lineupRaw.key === anaKey && lineupRaw.start ? lineupRaw.start : a.lineup.best) : [];
  const stale = anaKey && !a && !res.error;

  const info = a?.week_info || {};
  return (
    <>
      <SEO title="Fantasy this week" description="Your weekly matchup, best High Score lineup and free agents ranked by games this week." path="/basketball/fantasy/week" />
      <div className="fz-page" style={{ gap: 22, maxWidth: 1300 }}>
        <div className="fz-head">
          <div className="fz-head-l">
            <h1 className="fz-h1">Week {week}</h1>
            <span className="fz-sub">{info.start ? `${fmtDay(info.start)} – ${fmtDay(info.end)} · lineups lock at each game's tip-off${info.playoff ? " · fantasy playoffs" : ""}` : "Your matchup, lineup and streamers for this fantasy week."}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="fz-btn sm" disabled={week <= 1} onClick={() => setWeekPick(week - 1)} aria-label="Previous week">‹</button>
            <select className="fz-btn sm" value={week} onChange={(e) => setWeekPick(Number(e.target.value))} aria-label="Week">
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}</option>)}
            </select>
            <button className="fz-btn sm" disabled={week >= maxWeek} onClick={() => setWeekPick(week + 1)} aria-label="Next week">›</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <RosterSourceBar rs={rs} scope={false} />
          {others.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="fz-meta">Opponent</span>
              <select className="fz-btn sm" value={opp ?? ""} aria-label="Opponent" onChange={(e) => setOppPick({ key: ctxKey, v: Number(e.target.value) })}>
                {others.map((t) => <option key={t} value={t}>Team {t}</option>)}
              </select>
            </div>
          )}
        </div>
        {rs.error && <ErrorNote error={rs.error} what="the saved draft" />}

        {!body && (
          <div className="fz-card" style={{ padding: "26px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <span className="fz-h2">No roster for this week yet</span>
            <span className="fz-sub" style={{ maxWidth: 560, lineHeight: 1.55 }}>Finish a mock draft, fill your roster in the draft assistant, or pick a saved draft. Rosters here are your draft; in season the page will use your real league once Yahoo is connected.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="fz-btn light" onClick={() => navigate(`/basketball/fantasy/mock${f.query}`)}>Start a mock draft</button>
              <button className="fz-btn" onClick={() => navigate(`/basketball/fantasy/assistant${f.query}`)}>Open the assistant</button>
            </div>
          </div>
        )}
        {lg.error && <ErrorNote error={lg.error} what="the rosters" />}
        {res.error && <ErrorNote error={res.error} what="the week" />}
        {(stale || (body && !lg.data && !lg.error)) && <SkeletonList rows={6} height={44} />}
        <ValidationNotice v={a?.validation} />

        {a && (
          <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "minmax(0,1.15fr) minmax(0,1fr)", gap: phone ? 26 : 40, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <MatchupCard a={a} kind={kind} phone={phone} opp={opp} />
              {kind === "high_score" && (
                <Lineup a={a} start={start} setStart={(s) => setLineupRaw({ key: anaKey, start: s })} />
              )}
            </div>
            <Streamers a={a} kind={kind} fourOnly={fourOnly} setFourOnly={setFourOnly} />
          </div>
        )}
      </div>
    </>
  );
}
