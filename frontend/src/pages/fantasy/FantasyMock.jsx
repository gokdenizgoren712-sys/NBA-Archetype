// Tasarım 6 + 7 — Mock draft odası ve sonuç. Sunucu durumsuz: her adımda tüm
// pick listesi + tohum gider, botlar sıra sana gelene kadar seçer (aynı tohum
// aynı bot tahtaları). Yarım mock sekme yenilenince kaybolmasın: sessionStorage.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import {
  ArchChip, BAD, ErrorNote, GOOD, Meter, ProbBar, SkeletonList, ValidationNotice, fmt1, ordinal, pct,
} from "./ui";
import { pickOwner, useFantasy, useIsPhone } from "./useFantasy";

const STYLE_LABEL = { adp: "drafts by ADP", value: "drafts by our values" };
const PICK_SECONDS = 60;

function newSeed() { return Math.floor(Math.random() * 2 ** 31); }
function storeKey(f) { return `fz_mock_${JSON.stringify([f.apiFormat, f.t, f.s])}`; }
function readRun(f) {
  try { return JSON.parse(sessionStorage.getItem(storeKey(f)) || "null"); } catch { return null; }
}
// Biten draft simülatör için saklanır (aynı sekme); yeni mock başlayınca üzerine yazılır.
function writeLastMock(f, picks) {
  try { sessionStorage.setItem(`fz_lastmock_${JSON.stringify([f.apiFormat, f.t, f.s])}`, JSON.stringify({ picks })); } catch { /* özel mod */ }
}
function writeRun(f, run) {
  try { run ? sessionStorage.setItem(storeKey(f), JSON.stringify(run)) : sessionStorage.removeItem(storeKey(f)); } catch { /* özel mod */ }
}
const shortName = (n = "") => { const parts = n.split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : n; };

// ── Sonuç ─────────────────────────────────────────────────────────────────
function Moves({ rows, good }) {
  return rows.map((m) => {
    const d = Math.round(m.value_vs_adp);
    const c = good ? GOOD : d <= -3 ? BAD : "#8a8a8a";
    return (
      <div key={m.overall} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{m.player.name}</span>
          <span className="fz-meta">Pick {m.overall} · ADP {Math.round(m.adp)}</span>
        </div>
        <span className="fz-num" style={{ fontSize: 18, color: c }}>{d > 0 ? "+" : d < 0 ? "−" : "±"}{Math.abs(d)}</span>
      </div>
    );
  });
}

function Result({ f, run, grade, onAgain }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(null);
  const me = grade.me;
  const cats = me.category_win_prob ? Object.entries(me.category_win_prob) : [];
  const sortedCats = [...cats].sort((a, b) => b[1] - a[1]);
  const weak = sortedCats.filter(([, p]) => p < 0.25).map(([c]) => c);
  const build = cats.length ? (weak.length ? `Punt ${weak.join(" + ")}` : "Balanced") : "Points build";
  const buildSub = cats.length
    ? `Strong ${sortedCats.slice(0, 2).map(([c]) => c).join(", ")} · soft ${sortedCats[sortedCats.length - 1][0]}`
    : `${Math.round(me.total).toLocaleString("en-US")} projected points`;
  const dist = me.rank_dist || [];
  const top = Math.max(...dist, 0.01);
  const playoffTeams = Math.min(6, grade.league.length);

  const save = async () => {
    try {
      const d = await fz.drafts.create({
        kind: "mock", name: `Mock · ${build} · slot ${f.s}`, format: f.apiFormat, teams: f.t, slot: f.s,
        state: { seed: run.seed, picks: run.picks },
        result: { grade: grade.grade, projected_rank: me.projected_rank, playoff_prob: me.playoff_prob },
      });
      setSaved(d.id);
    } catch (e) { setSaved(`error:${e.message}`); }
  };


  return (
    <div className="fz-page" style={{ gap: 34, paddingTop: 36 }}>
      <SEO title="Mock draft result" description="Your mock draft grade, projected finish and category profile." path="/basketball/fantasy/mock" />
      <div className="fz-result-top" style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 48, alignItems: "center" }}>
        <div className="fz-result-grade" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <span className="fz-kicker">Draft grade</span>
          <span className="fz-grade">{grade.grade.replace("-", "−")}</span>
          <span className="fz-sub">{f.fmtInfo.label} · slot {f.s} of {f.t}</span>
        </div>
        <div className="fz-cols3" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
          <div className="fz-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="fz-meta">Projected finish</span>
            <span className="fz-num" style={{ fontSize: 36, lineHeight: 1.1 }}>{ordinal(me.projected_rank)} <span style={{ fontSize: 16, color: "#8a8a8a" }}>of {f.t}</span></span>
            <span className="fz-meta">{me.expected_category_record ? `About ${me.expected_category_record[0]}–${me.expected_category_record[1]} in cats over 19 weeks` : `Average finish ${fmt1(me.rank_mean)}`}</span>
          </div>
          <div className="fz-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="fz-meta">Playoff odds · top {playoffTeams}</span>
            <span className="fz-num" style={{ fontSize: 36, lineHeight: 1.1 }}>{pct(me.playoff_prob)}</span>
            <span className="fz-meta">From simulated seasons with our projection error</span>
          </div>
          <div className="fz-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="fz-meta">Build</span>
            <span className="fz-num" style={{ fontSize: 36, lineHeight: 1.1 }}>{build}</span>
            <span className="fz-meta">{buildSub}</span>
          </div>
        </div>
      </div>

      <div className="fz-cols3" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr)", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
            <span className="fz-h2">{cats.length ? "Category profile vs league" : "Your roster"}</span>
            <span className="fz-meta">{cats.length ? `Rank of ${f.t}` : ""}</span>
          </div>
          {cats.length
            ? cats.map(([c, p]) => <ProbBar key={c} cat={c} p={p} extra={ordinal(me.category_rank?.[c] ?? 0)} />)
            : grade.my_roster.map((p) => (
              <div key={p.player_id} className="fz-row" style={{ display: "flex", justifyContent: "space-between", minHeight: 36, alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>{p.name}</span><span className="fz-meta">{p.team}</span>
              </div>
            ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="fz-h2">Where you finish</span><span className="fz-meta">% of seasons</span>
          </div>
          <div style={{ height: 170, display: "flex", alignItems: "flex-end", gap: 5, boxShadow: "inset 0 -1px 0 #262626" }}>
            {dist.map((v, i) => (
              <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                <span className="fz-meta">{Math.round(v * 100)}%</span>
                <div style={{ width: "100%", height: `${(v / top) * 100}%`, borderRadius: "3px 3px 0 0",
                              background: i + 1 === me.projected_rank ? "#e5e5e5" : i < playoffTeams ? "#8a8a8a" : "#3a3a3a" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5 }}>{dist.map((_, i) => <span key={i} className="fz-meta" style={{ flex: 1, textAlign: "center" }}>{i + 1}</span>)}</div>
          <span className="fz-meta">Places 1–{playoffTeams} make the fantasy playoffs (weeks 20–22).</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="fz-h2" style={{ paddingBottom: 6 }}>Best value vs ADP</span>
            <Moves rows={grade.steals.filter((m) => m.value_vs_adp > 0)} good />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="fz-h2" style={{ paddingBottom: 6 }}>Biggest reaches</span>
            <Moves rows={grade.reaches.filter((m) => m.value_vs_adp < 0).slice(0, 2)} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="fz-gold fz-desk-only" onClick={onAgain}>Run another mock</button>
        <button className="fz-btn lg" onClick={() => navigate(`/basketball/fantasy/simulator${f.query}`)}>Simulate this season</button>
        {isLoggedIn
          ? <button className="fz-btn lg" disabled={typeof saved === "number"} onClick={save}>{typeof saved === "number" ? "Saved" : "Save"}</button>
          : <button className="fz-btn lg" onClick={() => navigate("/login")}>Sign in to save</button>}
        {typeof saved === "string" && <span className="fz-err">{saved.slice(6)}</span>}
      </div>
      <ValidationNotice v={grade.validation} />
      <span className="fz-meta" style={{ lineHeight: 1.6 }}>{grade.notes?.[0]}</span>
      <div className="fz-pinned"><button className="fz-gold" onClick={onAgain}>Run another mock</button></div>
    </div>
  );
}

// ── Oda ───────────────────────────────────────────────────────────────────
export default function FantasyMock() {
  const f = useFantasy();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [run, setRun] = useState(() => readRun(f) || { seed: newSeed(), picks: [] });
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState(null);
  const [timerOn, setTimerOn] = useState(false);
  const [left, setLeft] = useState(PICK_SECONDS);
  const [fullBoard, setFullBoard] = useState(false);
  const [mTab, setMTab] = useState("avail");
  const seq = useRef(0);

  const advance = useCallback(async (picks, seed) => {
    const my = ++seq.current;
    setBusy(true); setError(null);
    try {
      const d = await fz.mock({ format: f.apiFormat, teams: f.apiTeams, slot: f.s, picks, seed, n: 8 });
      if (my !== seq.current) return;
      const ids = d.picks.map((p) => p.player.player_id);
      setState(d);
      setRun({ seed, picks: ids });
      writeRun(f, d.done ? null : { seed, picks: ids });
      setLeft(PICK_SECONDS);
      if (d.done) {
        writeLastMock(f, ids);
        const g = await fz.grade({ format: f.apiFormat, teams: f.apiTeams, slot: f.s, picks: ids });
        if (my === seq.current) setGrade(g);
      }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [f]);

  // Format/takım/sıra değişince (ya da ilk açılışta) o ligin mock'unu başlat/sürdür.
  useEffect(() => {
    const saved = readRun(f) || { seed: newSeed(), picks: [] };
    setGrade(null); setState(null);
    advance(saved.picks, saved.seed);
  }, [f.apiFormat, f.t, f.s]);   // eslint-disable-line react-hooks/exhaustive-deps

  const draft = (pid) => { if (!busy && state && !state.done) advance([...run.picks, pid], run.seed); };
  const restart = () => { writeRun(f, null); setGrade(null); setState(null); advance([], newSeed()); };
  const leave = () => { writeRun(f, null); navigate("/basketball/fantasy"); };

  const recs = state?.recommendations || [];
  useEffect(() => {
    if (!timerOn || !state || state.done || busy) return undefined;
    if (left <= 0) { if (recs[0]) draft(recs[0].player_id); return undefined; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerOn, left, state, busy]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (grade) return <Result f={f} run={run} grade={grade} onAgain={restart} />;
  if (error && !state) return <div className="fz-page"><ErrorNote error={error} onRetry={() => advance(run.picks, run.seed)} what="the mock draft" /></div>;
  if (!state) return <div className="fz-page"><SkeletonList rows={8} /></div>;

  const teams = f.t;
  const rounds = f.rosterSize;
  const onClock = state.on_the_clock;
  const curRound = onClock ? Math.ceil(onClock / teams) : rounds;
  const byOverall = Object.fromEntries(state.picks.map((p) => [p.overall, p]));
  const shownRounds = fullBoard ? rounds : Math.min(rounds, Math.max(3, curRound + 1));
  const rec = recs[0];
  const clock = timerOn ? `0:${String(Math.max(0, left)).padStart(2, "0")}` : "";
  const reason = rec?.boosts?.length
    ? `Adds the most to ${rec.boosts.join(" and ")} for your roster as it stands.`
    : "Best available value for your roster.";
  const probs = state.category_prob ? Object.entries(state.category_prob) : [];
  const lineup = state.lineup?.starters || [];
  const mine = state.my_roster || [];
  const byId = Object.fromEntries(mine.map((p) => [p.player_id, p]));
  const recent = [...state.picks].slice(-4).reverse();

  const recCard = rec && (
    <div className="fz-card" style={{ padding: phone ? 16 : 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="fz-meta">Our pick for you</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="fz-d" style={{ fontSize: phone ? 22 : 24, lineHeight: 1 }}>{rec.player.name}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="fz-meta">{rec.player.team} · {rec.player.eligible.join(",") || "Util"}</span><ArchChip arch={rec.player.archetype} />
          </div>
        </div>
        <span className="fz-num" style={{ fontSize: phone ? 22 : 24 }}>{fmt1(rec.player.value)}</span>
      </div>
      <span style={{ fontSize: 14, lineHeight: 1.45 }}>{reason}</span>
      {state.next_pick && <span className="fz-meta">Chance still there at pick {state.next_pick}: {pct(rec.available_next_pick)}</span>}
      <ValidationNotice v={state.validation} compact />
      <button className="fz-gold" style={phone ? { height: 54, borderRadius: 12, fontSize: 18 } : undefined} disabled={busy}
        onClick={() => draft(rec.player_id)}>Draft {shortName(rec.player.name)}</button>
    </div>
  );

  const bestList = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!phone && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6 }}>
          <span className="fz-h2">Best available</span>{state.next_pick && <span className="fz-meta">Back at {state.next_pick}</span>}
        </div>
      )}
      {recs.slice(1).map((r) => (
        <div key={r.player_id} className="fz-row" onClick={() => !phone && draft(r.player_id)}
          style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr) auto auto" : "minmax(0,1fr) 40px 84px", alignItems: "center", gap: 10, minHeight: phone ? 60 : 48, cursor: phone ? "default" : "pointer" }}
          title={phone ? undefined : `Draft ${r.player.name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: phone ? 15 : 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.player.name}</span>
            <span className="fz-meta">{r.player.team} · {r.player.eligible.join(",") || "Util"} · <span style={{ color: ARCHETYPE_COLOR[r.player.archetype] || "#8a8a8a" }}>{r.player.archetype || "—"}</span>
              {phone && state.next_pick && <> · back at {state.next_pick} <span style={{ color: r.available_next_pick >= 0.65 ? GOOD : r.available_next_pick < 0.35 ? BAD : "#e5e5e5" }}>{pct(r.available_next_pick)}</span></>}</span>
          </div>
          <span className="fz-num" style={{ fontSize: 16, textAlign: "right" }}>{fmt1(r.player.value)}</span>
          {phone ? <button className="fz-btn" style={{ height: 44 }} disabled={busy} onClick={() => draft(r.player_id)}>Draft</button>
                 : <Meter p={r.available_next_pick} width={40} />}
        </div>
      ))}
    </div>
  );

  const rosterList = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!phone && <span className="fz-h2" style={{ paddingBottom: 8 }}>Your roster</span>}
      {lineup.map((s, i) => {
        const p = s.player_id ? byId[s.player_id] : null;
        return (
          <div key={`${s.slot}-${i}`} className="fz-row" style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto", alignItems: "center", minHeight: 36 }}>
            <span className="fz-num fz-muted" style={{ fontSize: 14 }}>{s.slot}</span>
            <span style={{ fontSize: 14, color: p ? "#e5e5e5" : "#8a8a8a" }}>{p ? p.name : "Empty"}</span>
            <span className="fz-meta">{p ? `${p.team} · ${p.eligible.join(",") || "Util"}` : ""}</span>
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, rounds - lineup.length) }, (_, i) => {
        const p = byId[(state.lineup?.bench || [])[i]];
        return (
          <div key={`bn-${i}`} className="fz-row" style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto", alignItems: "center", minHeight: 36 }}>
            <span className="fz-num fz-muted" style={{ fontSize: 14 }}>Bench</span>
            <span style={{ fontSize: 14, color: p ? "#e5e5e5" : "#8a8a8a" }}>{p ? p.name : "Empty"}</span>
            <span className="fz-meta">{p ? `${p.team} · ${p.eligible.join(",") || "Util"}` : ""}</span>
          </div>
        );
      })}
    </div>
  );

  const board = (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `36px repeat(${teams}, minmax(64px,1fr))`, gap: 4 }}>
        <span />
        {Array.from({ length: teams }, (_, i) => i + 1).map((t) => (
          <span key={t} title={t === f.s ? "You" : `Bot ${STYLE_LABEL[state.bot_styles?.[t]] || ""}`}
            style={{ fontSize: 12, fontWeight: 600, color: t === f.s ? "#e5e5e5" : "#8a8a8a", textAlign: "center", paddingBottom: 4 }}>
            {t === f.s ? "You" : `T${t}`}
          </span>
        ))}
      </div>
      {Array.from({ length: shownRounds }, (_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `36px repeat(${teams}, minmax(64px,1fr))`, gap: 4 }}>
          <span className="fz-meta" style={{ display: "flex", alignItems: "center" }}>R{r + 1}</span>
          {Array.from({ length: teams }, (_, t) => {
            const col = t + 1;
            // Snake: bu turda bu takımın genel pick numarası
            const overall = r % 2 === 0 ? r * teams + col : r * teams + (teams - col + 1);
            const pk = byOverall[overall];
            const isClock = overall === onClock;
            const mineCol = col === f.s;
            return (
              <div key={col} className={`fz-cell${pk ? (mineCol ? " mine" : "") : isClock ? " clock" : " empty"}`}>
                {pk && <span className="acc" style={{ background: ARCHETYPE_COLOR[pk.player.archetype] || "#3a3a3a" }} />}
                <span className="n" style={{ color: pk ? "#e5e5e5" : isClock ? "#FFB11B" : "#3a3a3a" }}>
                  {pk ? shortName(pk.player.name) : isClock ? "On the clock" : overall}
                </span>
                {pk && <span className="s">{pk.player.eligible.join(",") || "Util"}</span>}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10, alignItems: "center" }}>
        <span className="fz-meta">Bots: half draft by ADP, half by our values.</span>
        {rounds > shownRounds || fullBoard
          ? <button className="fz-link" style={{ fontSize: 12 }} onClick={() => setFullBoard((x) => !x)}>{fullBoard ? "Show current rounds" : "Show full board"}</button> : null}
      </div>
    </div>
  );

  const header = (
    <div className="fz-mockbar" style={{ height: phone ? 52 : 64, display: "flex", alignItems: "center", gap: phone ? 10 : 16, padding: phone ? "0 16px" : "0 36px", boxShadow: "inset 0 -1px 0 #1a1a1a" }}>
      <span className="fz-d" style={{ fontSize: phone ? 17 : 22 }}>{onClock ? `${phone ? "R" : "Round "}${curRound} · Pick ${onClock}` : "Draft complete"}</span>
      {onClock && pickOwner(onClock, teams) === f.s && <span className="fz-clock">{phone ? "On the clock" : "You're on the clock"}</span>}
      {busy && <span className="fz-meta">Bots are picking…</span>}
      {clock && <span className="fz-num" style={{ fontSize: phone ? 20 : 22 }}>{clock}</span>}
      <div style={{ flex: 1 }} />
      {!phone && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8a8a8a", cursor: "pointer" }}>
            Pick timer
            <input type="checkbox" checked={timerOn} onChange={(e) => { setTimerOn(e.target.checked); setLeft(PICK_SECONDS); }} style={{ accentColor: "#e5e5e5" }} />
          </label>
          <button className="fz-btn sm" disabled={!rec || busy} onClick={() => rec && draft(rec.player_id)}>Auto-pick</button>
          <button className="fz-btn sm quiet fz-muted" onClick={leave}>Leave</button>
        </>
      )}
    </div>
  );

  return (
    <>
      <SEO title="Fantasy mock draft" description="Mock draft against bots that draft by ADP and by our values." path="/basketball/fantasy/mock" />
      {header}
      {error && <div style={{ padding: "12px 36px" }}><ErrorNote error={error} onRetry={() => advance(run.picks, run.seed)} what="the next picks" /></div>}
      {!phone ? (
        <div style={{ padding: "22px 36px 36px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 28, maxWidth: 1400 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            {board}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 32 }}>
              {rosterList}
              {probs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
                    <span className="fz-h2">Live category profile</span><span className="fz-meta">{mine.length} player{mine.length === 1 ? "" : "s"}</span>
                  </div>
                  {probs.map(([c, p]) => <ProbBar key={c} cat={c} p={p} />)}
                  <span className="fz-meta">Win odds per category against an average rival, counting the picks you still have.</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {recCard}
            {bestList}
          </div>
        </div>
      ) : (
        <div className="fz-page" style={{ gap: 18 }}>
          {recCard}
          <div style={{ display: "flex", gap: 22, boxShadow: "inset 0 -1px 0 #1a1a1a", height: 40, alignItems: "flex-end" }}>
            {[["avail", "Available"], ["roster", `Roster ${mine.length}/${rounds}`], ["board", "Board"]].map(([k, l]) => (
              <button key={k} onClick={() => setMTab(k)}
                style={{ paddingBottom: 10, fontSize: 15, fontWeight: 500, border: 0, background: "none", cursor: "pointer",
                         color: mTab === k ? "#e5e5e5" : "#8a8a8a", boxShadow: mTab === k ? "inset 0 -2px 0 #e5e5e5" : "none" }}>{l}</button>
            ))}
          </div>
          {mTab === "avail" && bestList}
          {mTab === "roster" && <>{rosterList}{probs.length > 0 && probs.map(([c, p]) => <ProbBar key={c} cat={c} p={p} sm />)}</>}
          {mTab === "board" && board}
          <div className="fz-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Last picks</span>
            {recent.map((r) => (
              <div key={r.overall} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span className="fz-muted">{r.overall} · {r.slot === f.s ? "You" : `T${r.slot}`}</span><span>{shortName(r.player.name)}</span>
              </div>
            ))}
            <button className="fz-link" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={leave}>Leave mock</button>
          </div>
        </div>
      )}
    </>
  );
}
