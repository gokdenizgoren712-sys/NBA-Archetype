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

// ── Aynı ekranda çok kişilik mock (2–4 kişi) ──────────────────────────────
const HUMAN_COLORS = ["#FFB11B", "#4ade80", "#60a5fa", "#f472b6"];
const SPEEDS = { slow: 900, normal: 450, fast: 150, instant: 0 };
const SPEED_LABEL = { slow: "Slow", normal: "Normal", fast: "Fast", instant: "Instant" };
const readSpeed = () => {
  try { const v = localStorage.getItem("fz_mock_speed"); return SPEEDS[v] !== undefined ? v : "normal"; } catch { return "normal"; }
};
function readPlan(f) {
  try { return sessionStorage.getItem(`fz_mockplan_${JSON.stringify([f.apiFormat, f.t, f.s])}`) || null; } catch { return null; }
}
function writePlan(f, key) {
  try { key ? sessionStorage.setItem(`fz_mockplan_${JSON.stringify([f.apiFormat, f.t, f.s])}`, key) : sessionStorage.removeItem(`fz_mockplan_${JSON.stringify([f.apiFormat, f.t, f.s])}`); } catch { /* özel mod */ }
}
const spreadSlot = (i, count, teams) => Math.min(teams, Math.floor(((i + 0.5) * teams) / count) + 1);

function FriendsSetup({ f, options, onStart, onCancel }) {
  const [count, setCount] = useState(2);
  const [edits, setEdits] = useState({});
  const defPlan = options[0]?.key || "";
  const players = Array.from({ length: count }, (_, i) => ({
    name: `Player ${i + 1}`, slot: spreadSlot(i, count, f.t), plan: defPlan, ...edits[i],
  }));
  const set = (i, patch) => setEdits((e) => ({ ...e, [i]: { ...e[i], ...patch } }));
  const dupe = new Set(players.map((p) => p.slot)).size !== players.length;
  return (
    <div className="fz-page" style={{ gap: 22, maxWidth: 760 }}>
      <SEO title="Fantasy mock draft with friends" description="Draft on one screen with up to four people. Each person gets recommendations for their own plan." path="/basketball/fantasy/mock" />
      <div className="fz-head"><div className="fz-head-l">
        <h1 className="fz-h1">Mock with friends</h1>
        <span className="fz-sub">Up to four people share this screen. The draft stops on each person's pick and shows recommendations for that person's plan. Everyone else is a bot.</span>
      </div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="fz-meta">Players</span>
        <div className="fz-seg dark">{[2, 3, 4].map((n) => <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>)}</div>
      </div>
      <div className="fz-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 20px" }}>
        {players.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "12px minmax(0,1.2fr) 110px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: HUMAN_COLORS[i] }} />
            <input className="fz-input" value={p.name} maxLength={14} aria-label={`Player ${i + 1} name`} onChange={(e) => set(i, { name: e.target.value })} />
            <select className="fz-btn sm" value={p.slot} aria-label={`Player ${i + 1} draft slot`} onChange={(e) => set(i, { slot: Number(e.target.value) })}>
              {Array.from({ length: f.t }, (_, s) => s + 1).map((s) => <option key={s} value={s}>Slot {s}</option>)}
            </select>
            <select className="fz-btn sm" value={p.plan} aria-label={`Player ${i + 1} plan`} onChange={(e) => set(i, { plan: e.target.value })}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        ))}
        {dupe && <span className="fz-err">Each player needs their own draft slot.</span>}
        <span className="fz-meta">Plan = the build the recommendations follow for that person. Slots decide when each person picks.</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="fz-gold" disabled={dupe} onClick={() => onStart(players.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}` })))}>Start the draft</button>
        <button className="fz-btn lg" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}

function MultiResult({ f, run, state, grade, onAgain, onSetup }) {
  const phone = useIsPhone();
  const humans = run.humans;
  const label = (slot) => humans.find((h) => h.slot === slot)?.name || `T${slot}`;
  const colorOf = (slot) => HUMAN_COLORS[humans.findIndex((h) => h.slot === slot)] || "#8a8a8a";
  const planLabel = (h) => state.plan_options?.find((o) => o.key === h.plan)?.label || "Balanced";
  const rows = humans.map((h) => ({ h, l: grade.league.find((x) => x.slot === h.slot) })).sort((a, b) => a.l.projected_rank - b.l.projected_rank);
  const playoffTeams = Math.min(6, grade.league.length);
  return (
    <div className="fz-page" style={{ gap: 28, paddingTop: 30 }}>
      <SEO title="Mock draft results" description="Grades and projected finishes for everyone in the same-screen mock draft." path="/basketball/fantasy/mock" />
      <div className="fz-head"><div className="fz-head-l">
        <h1 className="fz-h1">Draft results</h1>
        <span className="fz-sub">{f.fmtInfo.label} · {humans.length} players on one screen · ranked by projected finish</span>
      </div></div>
      <ValidationNotice v={grade.validation} />
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : `repeat(${Math.min(humans.length, 2)}, minmax(0,1fr))`, gap: 12 }}>
        {rows.map(({ h, l }, i) => (
          <div key={h.slot} className="fz-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 18 }}>
            <span className="fz-grade" style={{ fontSize: 64, minWidth: 84 }}>{l.letter.replace("-", "−")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: colorOf(h.slot), flexShrink: 0 }} />{h.name}
                {i === 0 && <span className="fz-meta">Best draft</span>}
              </span>
              <span className="fz-meta">Slot {h.slot} · {planLabel(h)}</span>
              <span className="fz-sub" style={{ fontSize: 14 }}>
                Projected {ordinal(l.projected_rank)} of {f.t} · playoffs {pct(l.playoff_prob)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : `repeat(${humans.length}, minmax(0,1fr))`, gap: 24 }}>
        {humans.map((h) => (
          <div key={h.slot} style={{ display: "flex", flexDirection: "column" }}>
            <span className="fz-h2" style={{ paddingBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: colorOf(h.slot) }} />{h.name}
            </span>
            {(state.human_rosters?.[String(h.slot)]?.roster || []).map((p) => (
              <div key={p.player_id} className="fz-row" style={{ display: "flex", justifyContent: "space-between", minHeight: 34, alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                <span className="fz-meta" style={{ flexShrink: 0 }}>{p.team}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="fz-h2" style={{ paddingBottom: 6 }}>Whole league</span>
        {grade.league.map((r) => (
          <div key={r.slot} className="fz-row" style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 44px 64px", alignItems: "center", minHeight: 36, gap: 8 }}>
            <span className="fz-num fz-muted" style={{ fontSize: 15 }}>{r.projected_rank}</span>
            <span style={{ fontSize: 14, color: colorOf(r.slot) === "#8a8a8a" ? "#8a8a8a" : "#e5e5e5" }}>{label(r.slot)}</span>
            <span className="fz-num" style={{ fontSize: 15 }}>{r.letter.replace("-", "−")}</span>
            <span className="fz-meta" style={{ textAlign: "right" }}>{r.projected_rank <= playoffTeams ? "playoffs " : ""}{pct(r.playoff_prob)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="fz-gold" onClick={onAgain}>Run it again</button>
        <button className="fz-btn lg" onClick={onSetup}>Change players</button>
      </div>
    </div>
  );
}

// ── Oda ───────────────────────────────────────────────────────────────────
export default function FantasyMock() {
  const f = useFantasy();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [run, setRun] = useState(() => readRun(f) || { seed: newSeed(), picks: [], plan: readPlan(f), humans: null });
  const runRef = useRef(run);
  const [state, setState] = useState(null);
  const [shown, setShown] = useState(0);            // görünen pick sayısı (botların pickleri tek tek açılır)
  const [speed, setSpeedState] = useState(readSpeed);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState(null);
  const [timerOn, setTimerOn] = useState(false);
  const [left, setLeft] = useState(PICK_SECONDS);
  const [fullBoard, setFullBoard] = useState(false);
  const [mTab, setMTab] = useState("avail");
  const [setup, setSetup] = useState(false);
  const [rosterView, setRosterView] = useState(null);
  const seq = useRef(0);

  const setSpeed = (v) => { setSpeedState(v); try { localStorage.setItem("fz_mock_speed", v); } catch { /* özel mod */ } };

  // cfg: animate (yeni botların pickleri tek tek gelsin), humans / plan (verilirse çalışan run'ı geçersiz kılar)
  const advance = useCallback(async (picks, seed, cfg = {}) => {
    const my = ++seq.current;
    const base = runRef.current;
    const humans = "humans" in cfg ? cfg.humans : base.humans;
    const plan = "plan" in cfg ? cfg.plan : base.plan;
    setBusy(true); setError(null);
    try {
      const body = { format: f.apiFormat, teams: f.apiTeams, slot: humans ? humans[0].slot : f.s, picks, seed, n: 20 };
      if (humans) {
        body.humans = humans.map((h) => h.slot);
        body.plans = Object.fromEntries(humans.filter((h) => h.plan).map((h) => [String(h.slot), h.plan]));
      } else if (plan) body.plan = plan;
      const d = await fz.mock(body);
      if (my !== seq.current) return;
      const ids = d.picks.map((p) => p.player.player_id);
      const next = { seed, picks: ids, plan, humans };
      runRef.current = next;
      setState(d);
      setRun(next);
      setShown(cfg.animate ? picks.length : ids.length);
      writeRun(f, d.done ? null : next);
      setLeft(PICK_SECONDS);
      if (d.done) {
        if (!humans) writeLastMock(f, ids);       // simülatör son solo mock'u kaynak olarak kullanır
        const g = await fz.grade({ format: f.apiFormat, teams: f.apiTeams, slot: humans ? humans[0].slot : f.s, picks: ids });
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
    const saved = readRun(f);
    const fresh = saved || { seed: newSeed(), picks: [], plan: readPlan(f), humans: null };
    runRef.current = fresh;
    setRun(fresh); setGrade(null); setState(null); setSetup(false); setRosterView(null);
    advance(fresh.picks, fresh.seed, { animate: !saved || saved.picks.length === 0 });
  }, [f.apiFormat, f.t, f.s]);   // eslint-disable-line react-hooks/exhaustive-deps

  const draft = (pid) => {
    const r = runRef.current;
    if (!busy && state && !state.done) advance([...r.picks, pid], r.seed, { animate: true });
  };
  const startRun = (patch) => {
    writeRun(f, null);
    const next = { seed: newSeed(), picks: [], plan: runRef.current.plan, humans: runRef.current.humans, ...patch };
    runRef.current = next;
    setRun(next); setGrade(null); setState(null); setSetup(false); setRosterView(null);
    advance([], next.seed, { animate: true, humans: next.humans, plan: next.plan });
  };
  const restart = () => startRun({});
  const startFriends = (players) => startRun({ humans: players, plan: null });
  const backToSolo = () => startRun({ humans: null });
  const changePlan = (key) => {
    const next = { ...runRef.current, plan: key || null };
    runRef.current = next;
    setRun(next); writeRun(f, next); writePlan(f, key || null);
    advance(next.picks, next.seed, { animate: false, plan: next.plan });
  };
  const leave = () => { writeRun(f, null); navigate("/basketball/fantasy"); };

  const recs = state?.recommendations || [];
  const total = state ? state.picks.length : 0;
  const step = SPEEDS[speed];
  const visible = step === 0 ? total : Math.min(shown, total);
  const revealing = visible < total;
  useEffect(() => {
    if (!revealing) return undefined;
    const t = setTimeout(() => setShown((s) => Math.min(s + 1, total)), step);
    return () => clearTimeout(t);
  }, [revealing, shown, total, step]);

  useEffect(() => {
    if (!timerOn || !state || state.done || busy || revealing) return undefined;
    if (left <= 0) { if (recs[0]) draft(recs[0].player_id); return undefined; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerOn, left, state, busy, revealing]);   // eslint-disable-line react-hooks/exhaustive-deps

  const humans = run.humans;
  const multi = !!humans && humans.length > 1;
  if (setup && state) return <FriendsSetup f={f} options={state.plan_options || []} onStart={startFriends} onCancel={() => setSetup(false)} />;
  if (grade && !revealing) {
    return multi
      ? <MultiResult f={f} run={run} state={state} grade={grade} onAgain={restart} onSetup={() => setSetup(true)} />
      : <Result f={f} run={run} grade={grade} onAgain={restart} />;
  }
  if (error && !state) return <div className="fz-page"><ErrorNote error={error} onRetry={() => advance(run.picks, run.seed)} what="the mock draft" /></div>;
  if (!state) return <div className="fz-page"><SkeletonList rows={8} /></div>;

  const teams = f.t;
  const rounds = f.rosterSize;
  const humanSlots = (humans || [{ slot: f.s }]).map((h) => h.slot);
  const humanIdx = (slot) => humanSlots.indexOf(slot);
  const nameOf = (slot) => (humans ? humans.find((h) => h.slot === slot)?.name : slot === f.s ? "You" : null) || `T${slot}`;
  const onClock = revealing ? visible + 1 : state.on_the_clock;
  const clockSlot = onClock ? pickOwner(onClock, teams) : null;
  const yourTurn = !revealing && onClock && humanSlots.includes(clockSlot);
  const curRound = onClock ? Math.ceil(onClock / teams) : rounds;
  const seen = state.picks.slice(0, visible);
  const byOverall = Object.fromEntries(seen.map((p) => [p.overall, p]));
  const shownRounds = fullBoard ? rounds : Math.min(rounds, Math.max(3, curRound + 1));
  const rec = recs[0];
  const clock = timerOn && !revealing ? `0:${String(Math.max(0, left)).padStart(2, "0")}` : "";
  const reason = rec?.boosts?.length
    ? `Adds the most to ${rec.boosts.join(" and ")} for ${multi ? "this" : "your"} roster as it stands.`
    : `Best available value for ${multi ? "this" : "your"} roster.`;
  const probs = state.category_prob ? Object.entries(state.category_prob) : [];
  const viewSlot = rosterView ?? (humanSlots.includes(state.on_the_clock_slot) ? state.on_the_clock_slot : humanSlots[0]);
  const hr = state.human_rosters?.[String(viewSlot)] || { roster: state.my_roster, lineup: state.lineup };
  const lineup = hr.lineup?.starters || [];
  const mine = hr.roster || [];
  const byId = Object.fromEntries(mine.map((p) => [p.player_id, p]));
  const recent = [...seen].slice(-5).reverse();
  const nextHuman = (() => {
    for (let o = visible + 1; o <= teams * rounds; o += 1) if (humanSlots.includes(pickOwner(o, teams))) return o;
    return null;
  })();
  const planName = state.plan?.label;
  const dotFor = (slot) => (humanIdx(slot) >= 0 && multi ? HUMAN_COLORS[humanIdx(slot)] : null);

  const recCard = revealing ? (
    <div className="fz-card" style={{ padding: phone ? 16 : 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="fz-meta">Watching the picks</span>
      <span className="fz-d" style={{ fontSize: phone ? 20 : 22, lineHeight: 1.1 }}>{nameOf(clockSlot)} is picking…</span>
      <span className="fz-sub" style={{ fontSize: 13 }}>
        {nextHuman ? `${nextHuman === visible + 1 ? "You're" : `${nameOf(pickOwner(nextHuman, teams))} is`} up at pick ${nextHuman}.` : "Last picks of the draft."}
      </span>
      <button className="fz-btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setShown(total)}>Skip to the next human pick</button>
    </div>
  ) : rec && (
    <div className="fz-card" style={{ padding: phone ? 16 : 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="fz-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {multi && <span style={{ width: 8, height: 8, borderRadius: 4, background: dotFor(clockSlot) }} />}
          {multi ? `Pick for ${nameOf(clockSlot)}` : "Our pick for you"}
        </span>
        {planName && <span className="fz-meta">Plan · {planName}</span>}
      </div>
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

  const availList = recs.slice(1);
  const bestList = (
    <div style={{ display: "flex", flexDirection: "column", opacity: revealing ? 0.45 : 1, pointerEvents: revealing ? "none" : "auto" }}>
      {!phone && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6 }}>
          <span className="fz-h2">Best available</span><span className="fz-meta">{availList.length} players · click one to draft</span>
        </div>
      )}
      {!phone && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px 92px", gap: 10, alignItems: "center", height: 26, boxShadow: "inset 0 -1px 0 #262626", fontSize: 12, color: "#8a8a8a" }}>
          <span>Player</span>
          <span style={{ textAlign: "right" }} title="Our value score: how much the player adds to a team. Higher is better.">Value</span>
          <span style={{ textAlign: "right" }} title="Chance the player is still on the board when you pick again, if the other teams draft like the average drafter.">
            {state.next_pick ? `Left at ${state.next_pick}` : ""}
          </span>
        </div>
      )}
      <div style={phone ? undefined : { maxHeight: 620, overflowY: "auto" }}>
        {availList.map((r) => (
          <div key={r.player_id} className="fz-row" onClick={() => !phone && draft(r.player_id)}
            style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr) auto auto" : "minmax(0,1fr) 44px 92px", alignItems: "center", gap: 10, minHeight: phone ? 60 : 48, cursor: phone ? "default" : "pointer" }}
            title={phone ? undefined : `Draft ${r.player.name}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: phone ? 15 : 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.player.name}</span>
              <span className="fz-meta">{r.player.team} · {r.player.eligible.join(",") || "Util"} · <span style={{ color: ARCHETYPE_COLOR[r.player.archetype] || "#8a8a8a" }}>{r.player.archetype || "—"}</span>
                {phone && state.next_pick && <> · left at {state.next_pick} <span style={{ color: r.available_next_pick >= 0.65 ? GOOD : r.available_next_pick < 0.35 ? BAD : "#e5e5e5" }}>{pct(r.available_next_pick)}</span></>}</span>
            </div>
            <span className="fz-num" style={{ fontSize: 16, textAlign: "right" }}>{fmt1(r.player.value)}</span>
            {phone ? <button className="fz-btn" style={{ height: 44 }} disabled={busy} onClick={() => draft(r.player_id)}>Draft</button>
              : state.next_pick ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}><Meter p={r.available_next_pick} width={34} /></div>
              ) : <span />}
          </div>
        ))}
      </div>
      {state.next_pick && (
        <span className="fz-meta" style={{ lineHeight: 1.5, paddingTop: 8 }}>
          {phone ? "Left at " : "“Left at "}{state.next_pick}{phone ? " = " : "” = "}the chance the player is still on the board when {multi ? "this person picks" : "you pick"} again at pick {state.next_pick},
          if the other teams draft like the average drafter. Value = how much the player adds to a team.
        </span>
      )}
    </div>
  );

  const rosterList = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!phone && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 8 }}>
          <span className="fz-h2">{multi ? `${nameOf(viewSlot)}'s roster` : "Your roster"}</span>
          {multi && (
            <div className="fz-seg sm dark">
              {humans.map((h, i) => (
                <button key={h.slot} className={viewSlot === h.slot ? "on" : ""} onClick={() => setRosterView(h.slot)} style={{ color: viewSlot === h.slot ? undefined : HUMAN_COLORS[i] }}>{h.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {phone && multi && (
        <div className="fz-seg sm dark scroll" style={{ marginBottom: 8 }}>
          {humans.map((h) => <button key={h.slot} className={viewSlot === h.slot ? "on" : ""} onClick={() => setRosterView(h.slot)}>{h.name}</button>)}
        </div>
      )}
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
        const p = byId[(hr.lineup?.bench || [])[i]];
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
        {Array.from({ length: teams }, (_, i) => i + 1).map((t) => {
          const isHuman = humanIdx(t) >= 0;
          return (
            <span key={t} title={isHuman ? nameOf(t) : `Bot ${STYLE_LABEL[state.bot_styles?.[t]] || ""}`}
              style={{ fontSize: 12, fontWeight: 600, color: isHuman ? "#e5e5e5" : "#8a8a8a", textAlign: "center", paddingBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dotFor(t) && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: dotFor(t), marginRight: 4 }} />}
              {isHuman ? nameOf(t) : `T${t}`}
            </span>
          );
        })}
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
            const mineCol = humanIdx(col) >= 0;
            const isNew = pk && revealing && overall === visible;
            return (
              <div key={col} className={`fz-cell${pk ? (mineCol ? " mine" : "") : isClock ? " clock" : " empty"}${isNew ? " new" : ""}`}>
                {pk && <span className="acc" style={{ background: ARCHETYPE_COLOR[pk.player.archetype] || "#3a3a3a" }} />}
                <span className="n" style={{ color: pk ? "#e5e5e5" : isClock ? "#FFB11B" : "#3a3a3a" }}>
                  {pk ? shortName(pk.player.name) : isClock ? (revealing ? "Picking…" : "On the clock") : overall}
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

  const feed = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="fz-h2" style={{ paddingBottom: 6 }}>Latest picks</span>
      {recent.length === 0 && <span className="fz-meta">Nothing picked yet.</span>}
      {recent.map((r, i) => (
        <div key={r.overall} className="fz-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 34, opacity: i === 0 ? 1 : 0.75 }}>
          <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span className="fz-num fz-muted" style={{ fontSize: 13, minWidth: 22 }}>{r.overall}</span>
            <span style={{ color: dotFor(r.slot) || (humanIdx(r.slot) >= 0 ? "#e5e5e5" : "#8a8a8a"), whiteSpace: "nowrap" }}>{nameOf(r.slot)}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.player.name}</span>
          </span>
          <span className="fz-meta" style={{ flexShrink: 0 }}>{r.player.eligible.join(",") || "Util"}</span>
        </div>
      ))}
    </div>
  );

  const speedSeg = (
    <div className="fz-seg sm dark" title="How fast the bots' picks appear">
      {Object.keys(SPEEDS).map((k) => <button key={k} className={speed === k ? "on" : ""} onClick={() => setSpeed(k)}>{SPEED_LABEL[k]}</button>)}
    </div>
  );

  const header = (
    <div className="fz-mockbar" style={{ height: phone ? 52 : 64, display: "flex", alignItems: "center", gap: phone ? 10 : 16, padding: phone ? "0 16px" : "0 36px", boxShadow: "inset 0 -1px 0 #1a1a1a" }}>
      <span className="fz-d" style={{ fontSize: phone ? 17 : 22 }}>{onClock ? `${phone ? "R" : "Round "}${curRound} · Pick ${onClock}` : "Draft complete"}</span>
      {yourTurn && <span className="fz-clock">{multi ? `${nameOf(clockSlot)}'s pick` : phone ? "On the clock" : "You're on the clock"}</span>}
      {revealing && <span className="fz-meta">{nameOf(clockSlot)} {phone ? "" : "is "}picking…</span>}
      {busy && !revealing && <span className="fz-meta">Bots are picking…</span>}
      {clock && <span className="fz-num" style={{ fontSize: phone ? 20 : 22 }}>{clock}</span>}
      <div style={{ flex: 1 }} />
      {revealing && <button className="fz-btn sm" onClick={() => setShown(total)}>Skip</button>}
      {!phone && (
        <>
          {speedSeg}
          {!multi && state.plan_options?.length > 0 && (
            <select className="fz-btn sm" value={state.plan?.key || state.plan_options[0].key} onChange={(e) => changePlan(e.target.value)} aria-label="Plan the recommendations follow" title="Plan the recommendations follow">
              {state.plan_options.map((o) => <option key={o.key} value={o.key}>Plan · {o.label}</option>)}
            </select>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8a8a8a", cursor: "pointer" }}>
            Pick timer
            <input type="checkbox" checked={timerOn} onChange={(e) => { setTimerOn(e.target.checked); setLeft(PICK_SECONDS); }} style={{ accentColor: "#e5e5e5" }} />
          </label>
          <button className="fz-btn sm" disabled={!rec || busy || revealing} onClick={() => rec && draft(rec.player_id)}>Auto-pick</button>
          <button className="fz-btn sm" onClick={() => setSetup(true)}>{multi ? "Change players" : "Play with friends"}</button>
          {multi && <button className="fz-btn sm quiet fz-muted" onClick={backToSolo}>Solo</button>}
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
        <div style={{ padding: "22px 36px 36px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 28, maxWidth: 1440 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            {board}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 32 }}>
              {rosterList}
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                {feed}
                {probs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
                      <span className="fz-h2">Live category profile</span><span className="fz-meta">{multi ? `${nameOf(state.on_the_clock_slot)} · ` : ""}{state.my_roster?.length || 0} player{(state.my_roster?.length || 0) === 1 ? "" : "s"}</span>
                    </div>
                    {probs.map(([c, p]) => <ProbBar key={c} cat={c} p={p} />)}
                    <span className="fz-meta">Win odds per category against an average rival, counting the picks still to come.</span>
                  </div>
                )}
              </div>
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
          <div className="fz-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {feed}
            {speedSeg}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button className="fz-link" onClick={() => setSetup(true)}>{multi ? "Change players" : "Play with friends"}</button>
              <button className="fz-link" onClick={leave}>Leave mock</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
