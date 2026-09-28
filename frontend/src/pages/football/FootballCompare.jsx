import { useState, useEffect, useMemo } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballPlayerCard from "../../components/FootballPlayerCard";
import PlayerSearch from "../../game/football/PlayerSearch";
import ExploreHeader from "../../components/explore/ExploreHeader";
import { FOOTBALL_EXPLORE_TABS } from "./FootballMap";

// ── Futbol · Compare (handoff 16b) — FAZ İÇİ ────────────────────────────────
// Sert kural korunuyor: ikinci oyuncu birincinin FAZINDAN seçilir (bir kalecinin
// forvet arketiplerinde skoru yok, kıyas bir şey söylemez). Basketbol Compare'le
// aynı dil: iki kart, VS + rol benzerliği; altta arketip uyumu (persantil) ve
// per-90 satırları. Per-90 ham değer — çubuk, ikisinden yükseğe göre oran
// (persantil değil, öyle etiketleniyor).

const A_C = "#E8654C", B_C = "#3FB08C";
const PHASE_LABEL = { gk: "goalkeepers", def: "defenders", mid: "midfielders", fwd: "attackers" };

const COMPARE_ROWS = {
  gk: [["saves_90", "Saves"], ["save_pct", "Save %"], ["goals_prevented_90", "Goals prevented"],
       ["keeper_sweeper_90", "Sweeper actions"], ["keeper_high_claim_90", "High claims"],
       ["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"], ["CLEAN_SHEETS", "Clean sheets"]],
  def: [["tackles_90", "Tackles"], ["interceptions_90", "Interceptions"], ["clearances_90", "Clearances"],
        ["aerials_won_90", "Aerials won"], ["aerial_pct", "Aerial %"], ["accurate_passes_att_90", "Passes"],
        ["pass_pct", "Pass %"], ["passes_into_final_third_90", "Into final third"],
        ["accurate_crosses_att_90", "Crosses"], ["CLEAN_SHEETS", "Clean sheets"]],
  mid: [["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"], ["passes_into_final_third_90", "Into final third"],
        ["chances_created_90", "Chances created"], ["expected_assists_90", "xA"], ["assists_90", "Assists"],
        ["tackles_90", "Tackles"], ["recoveries_90", "Recoveries"], ["dribbles_succeeded_90", "Dribbles"],
        ["touches_opp_box_90", "Opp. box touches"]],
  fwd: [["goals_90", "Goals"], ["expected_goals_non_penalty_90", "npxG"], ["total_shots_90", "Shots"],
        ["npxg_per_shot", "npxG / shot"], ["assists_90", "Assists"], ["expected_assists_90", "xA"],
        ["chances_created_90", "Chances created"], ["dribbles_succeeded_90", "Dribbles"],
        ["accurate_crosses_att_90", "Crosses"], ["touches_opp_box_90", "Opp. box touches"],
        ["aerials_won_90", "Aerials won"]],
};
const PCT = new Set(["pass_pct", "save_pct", "aerial_pct", "cross_pct", "ground_duel_pct", "dribble_pct", "long_pct", "sot_pct"]);
const COUNT = new Set(["CLEAN_SHEETS"]);
const fmt = (k, v) => (v == null || Number.isNaN(v) ? "—"
  : COUNT.has(k) ? String(Math.round(v))
  : PCT.has(k) ? `${Math.round(v * 100)}%`
  : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const last = (n = "") => n.split(" ").slice(-1)[0];
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

function Row({ label, a, b, fa = (v) => v, lowerBetter = false, relative = false }) {
  if (a == null && b == null) return null;
  const aw = a != null && b != null && (lowerBetter ? a < b : a > b);
  const bw = a != null && b != null && (lowerBetter ? b < a : b > a);
  const max = relative ? Math.max(Math.abs(a || 0), Math.abs(b || 0)) || 1 : 100;
  const w = (v) => `${Math.max(0, Math.min(100, ((v || 0) / max) * 100))}%`;
  return (
    <div className="cmp-row">
      <b style={{ color: aw ? A_C : "var(--text-secondary)", textShadow: aw ? `0 0 12px ${A_C}88` : "none" }}>{fa(a)}</b>
      <div className="tr l"><i style={{ width: w(a), background: A_C, opacity: aw ? 1 : 0.45, boxShadow: aw ? `0 0 10px ${A_C}` : "none" }} /></div>
      <span>{label}</span>
      <div className="tr"><i style={{ width: w(b), background: B_C, opacity: bw ? 1 : 0.45, boxShadow: bw ? `0 0 10px ${B_C}` : "none" }} /></div>
      <b className="r" style={{ color: bw ? B_C : "var(--text-secondary)", textShadow: bw ? `0 0 12px ${B_C}88` : "none" }}>{fa(b)}</b>
    </div>
  );
}

export default function FootballCompare() {
  const [meta, setMeta]   = useState(null);
  const [season, setSeason] = useState("");
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [detA, setDetA] = useState(null);
  const [detB, setDetB] = useState(null);

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  // İlk açılış: boş sayfa yerine sezonun en yüksek iki hücumcusu
  useEffect(() => {
    if (!season || a || b) return;
    api.footballPlayers({ season, phase: "fwd", limit: 2, sort: "overall_score" })
      .then(r => { const [p1, p2] = r.players || []; if (p1) setA(p1); if (p2) setB(p2); })
      .catch(() => {});
  }, [season]); // eslint-disable-line

  // A değişir ve B başka fazdaysa B düşer — kıyaslanamaz çift kalmasın
  useEffect(() => { if (a && b && a.PHASE !== b.PHASE) setB(null); }, [a]); // eslint-disable-line

  const phase = a?.PHASE || b?.PHASE || null;
  const archNames = phase && meta?.archetypes ? (meta.archetypes[phase] || []) : [];
  const rows = phase ? (COMPARE_ROWS[phase] || []) : [];

  useEffect(() => {
    if (!a || !season) { setDetA(null); return; }
    api.footballPlayers({ season, search: a.PLAYER_NAME, phase: a.PHASE, limit: 5 })
      .then(r => setDetA((r.players || []).find(p => p.PLAYER_ID === a.PLAYER_ID) || null))
      .catch(() => setDetA(null));
  }, [a, season]);
  useEffect(() => {
    if (!b || !season) { setDetB(null); return; }
    api.footballPlayers({ season, search: b.PLAYER_NAME, phase: b.PHASE, limit: 5 })
      .then(r => setDetB((r.players || []).find(p => p.PLAYER_ID === b.PLAYER_ID) || null))
      .catch(() => setDetB(null));
  }, [b, season]);

  const sim = useMemo(() => {
    if (!detA || !detB || !archNames.length) return null;
    const vec = (p) => { const v = archNames.map(k => Number(p[`score_${k}`] ?? 0)); const m = v.reduce((x, y) => x + y, 0) / v.length; return v.map(x => x - m); };
    return cosine(vec(detA), vec(detB));
  }, [detA, detB, archNames]);

  const verdict = useMemo(() => {
    if (!detA || !detB || !archNames.length) return "";
    const r = archNames.map(k => ({ k, a: Number(detA[`score_${k}`] ?? 0), b: Number(detB[`score_${k}`] ?? 0) }));
    const shared = [...r].sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b))[0];
    const split = [...r].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
    const who = split.a > split.b ? last(detA.PLAYER_NAME) : last(detB.PLAYER_NAME);
    return `${Math.min(shared.a, shared.b) >= 0.7 ? `Both fit ${shared.k}.` : `Closest ground: ${shared.k}.`} They split most on ${split.k}, where ${who} is far ahead.`;
  }, [detA, detB, archNames]);

  const side = (k, d, pick, value, color, lockPhase) => (
    <div className="cmp-side">
      <div className="cmp-card">
        {d ? <FootballPlayerCard player={d} season={season} />
           : <div className="cmp-slot">{value ? "Loading…" : "Pick a player"}</div>}
      </div>
      <div className="cmp-av" style={{ "--c": color }}>
        <span className="av">{d ? initials(d.PLAYER_NAME) : "?"}</span>
        <b>{d?.PLAYER_NAME || "Pick a player"}</b>
        {d && <em>{d.primary_arch}</em>}
      </div>
      <div className="fbc-pick">
        {/* value boş: yazmaya başlamak mevcut seçimi silmesin, yeni seçim onu değiştirir */}
        <PlayerSearch value={null} placeholder="Change player" onPick={(p) => p && pick(p)} phase={lockPhase} season={season} accent={color} />
      </div>
    </div>
  );

  return (
    <div className="ex-page">
      <SEO title="Football — Compare Players"
        description="Two players side by side on the roles that actually apply to them."
        path="/football/compare" noindex />
      <div className="cmp-glow" aria-hidden="true" style={{ "--a": A_C, "--b": B_C }} />
      <div className="ex-inner">
        <ExploreHeader active="compare" tabs={FOOTBALL_EXPLORE_TABS} aside={
          <label className="cmp-season" style={{ "--c": B_C }}>
            <select value={season} onChange={e => setSeason(e.target.value)} aria-label="Season">
              {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        } />

        <div className="cmp-top">
          {side("a", detA, setA, a, A_C, b?.PHASE || null)}
          <div className="cmp-vs">
            <span className="vs">VS</span>
            {sim != null && (
              <>
                <span className="lbl">Role similarity</span>
                <span className="pct" style={{ color: B_C, textShadow: `0 0 20px ${B_C}73` }}>{Math.round(((sim + 1) / 2) * 100)}%</span>
                <p>{verdict}</p>
              </>
            )}
            {phase && <p className="fbc-rule">Both from the {PHASE_LABEL[phase]} — a keeper has no score on attacking roles, so only same-phase pairs compare.</p>}
          </div>
          {side("b", detB, setB, b, B_C, a?.PHASE || null)}
        </div>

        {detA && detB && (
          <>
            <div className="ex-divider" />
            <div className="fbc-sections">
              <section>
                <div className="ex-h"><span>Archetype fit, head to head</span><em>Percentile within each player's league and phase</em></div>
                {archNames.map(k => (
                  <Row key={k} label={k} a={detA[`score_${k}`] != null ? detA[`score_${k}`] * 100 : null}
                    b={detB[`score_${k}`] != null ? detB[`score_${k}`] * 100 : null} fa={v => (v == null ? "—" : Math.round(v))} />
                ))}
              </section>
              <section>
                <div className="ex-h"><span>Per 90, head to head</span><em>Raw values · bar relative to the higher of the two</em></div>
                {rows.map(([k, label]) => (
                  <Row key={k} label={label} a={detA[k]} b={detB[k]} relative fa={v => fmt(k, v)} />
                ))}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
