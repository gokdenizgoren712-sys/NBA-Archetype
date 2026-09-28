import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api";
import RoleImpactChart from "../components/RoleImpactChart";
import PlayerCard from "../components/PlayerCard";
import PaIcon from "../components/shell/PaIcon";
import { PageGlow } from "../components/states/States";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { computeLineupFit, GRADE_COLOR, PILLAR_LABELS } from "../utils/lineupScoring";
import { ARCHETYPE_COLOR as ARCH_HEX } from "../constants/archetypeColors";
import { POS_COLOR } from "../constants/positionColors";
import "./lineups.css";

// ── Lineups (handoff 10a / mobil 21a) ───────────────────────────────────────
// Sol: "Build your five" (beş arama satırı + Calculate fit) ve sonuç paneli
// (büyük skor + not + beş pillar). Sağ: alt çizgili Theoretical / Real
// lineups sekmeleri; satırlar 96px, her slotta pozisyon · isim · arketip ve
// arkasında arketip renginde yumuşak ışık, sağda fit. Satıra tıklayınca gerçek
// kartlar + pillarlar açılır. Skor 100 üzerinden Lineup Fit — persantil DEĞİL.

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const POS_NAME = { PG: "Point guard", SG: "Shooting guard", SF: "Small forward", PF: "Power forward", C: "Center" };
const FIT_HEX = (v) => (v >= 0.80 ? "#4ade80" : v >= 0.65 ? "#facc15" : v >= 0.50 ? "#fb923c" : "#f87171");
const GRADE_WORD = { S: "elite fit", A: "strong fit", B: "good fit", C: "uneven fit", D: "poor fit" };

/* 12 kenarlı pozisyon rozeti (10a) */
function PosBadge({ pos, color }) {
  return (
    <span className="lu-pos" style={{ "--c": color }}>
      <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
        <polygon points="24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7"
          fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <b>{pos}</b>
    </span>
  );
}

/* Sezona duyarlı oyuncu arama satırı */
function SlotSearch({ pos, value, arch, onChange, season, placeholder }) {
  const [query, setQuery]     = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const timer = useRef(null);
  const ref   = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { setQuery(value || ""); }, [value]);

  const change = (val) => {
    setQuery(val);
    onChange(val, null);
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await api.historical(season, { search: val, limit: 8 });
        setResults(d.players || []); setOpen(true);
      } catch { /* liste boş kalır */ }
    }, 280);
  };
  const pick = (p) => { setQuery(p.PLAYER_NAME); onChange(p.PLAYER_NAME, p.primary_arch || null); setOpen(false); };

  return (
    <div ref={ref} className="lu-slot">
      <PosBadge pos={pos} color={POS_COLOR[pos]} />
      <input value={query} onChange={e => change(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder} aria-label={placeholder} />
      {arch && <span className="arch" style={{ color: ARCH_HEX[arch] }}>{arch}</span>}
      {open && results.length > 0 && (
        <div className="lu-results" role="listbox">
          {results.map(p => (
            <button key={p.PLAYER_NAME} role="option" onClick={() => pick(p)}>
              <span className="nm">{p.PLAYER_NAME}<em>{p.TEAM_ABBREVIATION} · {p.POSITION}</em></span>
              <span className="ar" style={{ color: ARCH_HEX[p.primary_arch] || "var(--text-muted)" }}>{p.primary_arch}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bars({ rows }) {
  return (
    <div className="lu-bars">
      {rows.map(r => (
        <div key={r.label} style={{ "--c": r.c }}>
          <span>{r.label}{r.extra && <em>{r.extra}</em>}</span>
          <div className="tr"><i style={{ width: `${r.v}%` }} /></div>
          <b>{r.v}</b>
        </div>
      ))}
    </div>
  );
}

/* Sonuç: güncel sezon — tek formül (game/lineupScore) + pozisyon başına era çarpanı */
function ResultPanel({ result, isCurrent, saved, onSave }) {
  const fit = useMemo(() => (isCurrent && result?.players_data ? computeLineupFit(result.players_data) : null), [result, isCurrent]);
  if (!result) return null;

  let score, grade = null, rows;
  if (fit) {
    score = fit.pct; grade = fit.grade;
    rows = Object.entries(PILLAR_LABELS).map(([k, label]) => ({
      label, v: Math.round((fit[k] || 0) * 100), c: FIT_HEX(fit[k] || 0),
      extra: k === "spacing" && fit.nShooters != null ? ` · ${fit.nShooters} shooters` : "",
    }));
  } else {
    const p = result.pillar_breakdown || {
      Creation: result.creation, Spacing: result.spacing, Defense: result.defense,
      Finishing: result.finishing, Chemistry: result.role_fit ?? result.Denge,
    };
    score = Math.round((result.lineup_score ?? result.Uyum_Skoru ?? 0) * 100);
    rows = Object.entries(p).filter(([, v]) => v != null).map(([k, v]) => ({
      label: k, v: Math.round(v * 100), c: FIT_HEX(v),
      extra: k === "Spacing" && result.n_shooters != null ? ` · ${result.n_shooters} shooters` : "",
    }));
  }
  const c = grade ? GRADE_COLOR[grade] : FIT_HEX(score / 100);

  return (
    <section className="lu-panel lu-result" style={{ "--pc": c }}>
      <div className="lu-score">
        <b style={{ color: c, textShadow: `0 0 26px ${c}80` }}>{score}</b>
        <div>
          <span>{grade ? `Grade ${grade} · ${GRADE_WORD[grade]}` : "Lineup fit"}</span>
          <em>Lineup Fit, out of 100 — the same score the game uses</em>
        </div>
      </div>
      <Bars rows={rows} />
      {fit && result.players_data && (
        <div className="lu-era">
          {result.players_data.map((p, i) => {
            const pf = fit.perPlayer[i];
            if (!pf) return null;
            const ef = pf.eraFactor;
            return (
              <div key={p.name}>
                <span>{p.name}</span>
                <em style={{ color: ARCH_HEX[p.primary_arch] }}>{p.primary_arch}</em>
                <b style={{ color: ef >= 1.05 ? "#4ade80" : ef <= 0.88 ? "#f87171" : "var(--text-muted)" }}>×{ef.toFixed(2)}</b>
              </div>
            );
          })}
          <p>Era factor: how much each archetype is in demand in today's game.</p>
        </div>
      )}
      <button className="pa-btn-secondary" onClick={onSave} disabled={saved}>{saved ? "Saved to your profile" : "Save lineup"}</button>
    </section>
  );
}

/* Satır: 5 slot + fit; tıklayınca gerçek kartlar */
function LineupRow({ rank, slots, fit, meta, expandBody }) {
  const [open, setOpen] = useState(false);
  const c = fit != null ? FIT_HEX(fit) : "var(--text-muted)";
  return (
    <div className={`lu-row${open ? " open" : ""}`}>
      <button className="lu-row-main" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="rk">{rank}</span>
        <div className="slots">
          {slots.map((s, i) => (
            <div key={i} className="sl" style={{ "--c": s.color || "#8b857e" }}>
              <i className="glow" />
              {s.pos && <span className="p">{s.pos}</span>}
              {/* dar sütunda tam ad kesiliyordu — soyad, tam ad title'da */}
              <span className="n" title={s.name}>{s.name.split(" ").slice(1).join(" ") || s.name}</span>
              {s.arch && <span className="a">{s.arch}</span>}
            </div>
          ))}
        </div>
        <span className="fit">
          {fit != null && <b style={{ color: c, textShadow: `0 0 18px ${c}88` }}>{Math.round(fit * 100)}</b>}
          {meta && <em>{meta}</em>}
        </span>
      </button>
      {open && expandBody && <div className="lu-row-body">{expandBody}</div>}
    </div>
  );
}

export default function Lineups() {
  const { t, lang } = useLang();
  const { token, isLoggedIn } = useAuth();

  const [seasons, setSeasons]           = useState(["2025-26"]);
  const [season, setSeason]             = useState("2025-26");
  const [topLineups, setTopLineups]     = useState([]);
  const [loading, setLoading]           = useState(false);
  const [slots, setSlots]               = useState(["", "", "", "", ""]);
  const [slotArch, setSlotArch]         = useState([null, null, null, null, null]);
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError]   = useState("");
  const [mode, setMode]                 = useState("positional");
  const [tab, setTab]                   = useState("theoretical");
  const [realLineups, setRealLineups]   = useState([]);
  const [realLoading, setRealLoading]   = useState(false);
  const [realSort, setRealSort]         = useState("NET_RATING");
  const [corr, setCorr]                 = useState(null);
  const [lineupSaved, setLineupSaved]   = useState(false);
  const [playerMap, setPlayerMap]       = useState(null);

  const isCurrent = season === "2025-26";

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "theoretical") return;
    setLoading(true);
    setTopLineups([]);
    const p = isCurrent
      ? api.lineupCompat({ limit: 50, positional: mode === "positional" ? 1 : 0, unique: 1 })
      : api.historicalLineup(season, 30);
    p.then(d => setTopLineups(d.lineups || [])).catch(() => setTopLineups([])).finally(() => setLoading(false));
  }, [season, mode, tab]); // eslint-disable-line

  // Açılan satırlarda gerçek PlayerCard için tek seferlik geniş çekim
  useEffect(() => {
    if (!isCurrent || playerMap) return;
    api.players({ limit: 300, sort_by: "overall_score" })
      .then(d => setPlayerMap(new Map((d.players || []).map(p => [p.PLAYER_NAME, p]))))
      .catch(() => {});
  }, [isCurrent, playerMap]);

  useEffect(() => {
    if (tab !== "real" || !isCurrent) return;
    setRealLoading(true);
    api.realLineups({ limit: 50, sort_by: realSort, min_min: 50 })
      .then(d => setRealLineups(d.lineups || []))
      .catch(() => setRealLineups([]))
      .finally(() => setRealLoading(false));
    if (!corr) fetch("/api/lineups/correlation").then(r => r.json()).then(setCorr).catch(() => {});
  }, [tab, realSort, isCurrent]); // eslint-disable-line

  useEffect(() => {
    setSlots(["", "", "", "", ""]); setSlotArch([null, null, null, null, null]);
    setCustomResult(null); setCustomError("");
  }, [season]);

  const setSlot = (i, v, arch) => {
    setSlots(prev => { const a = [...prev]; a[i] = v; return a; });
    setSlotArch(prev => { const a = [...prev]; a[i] = arch; return a; });
  };

  const evalCustom = async () => {
    setCustomResult(null); setCustomError(""); setLineupSaved(false);
    const names = slots.map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { setCustomError(t("enter_min_2")); return; }
    try {
      setCustomResult(isCurrent ? await api.customLineup(names) : await api.historicalCustomLineup(season, names));
    } catch (e) { setCustomError(e.message || "That didn't calculate. Check the names and try again."); }
  };

  const saveLineup = async () => {
    if (!isLoggedIn) { window.location.href = "/login"; return; }
    if (!customResult) return;
    const fit = customResult.players_data ? computeLineupFit(customResult.players_data) : null;
    const names = slots.map(s => s.trim()).filter(Boolean);
    try {
      await fetch("/api/profile/saved-lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          players: names, score: fit ? fit.pct / 100 : customResult.lineup_score,
          grade: fit?.grade || "", pct: fit?.pct || null, label: names.join(" · "),
        }),
      });
      setLineupSaved(true);
    } catch { /* düğme tekrar denenebilir */ }
  };

  const cards = (names) => playerMap && (
    <div className="lu-cards">
      {names.map((n, i) => {
        const p = playerMap.get(n);
        return p ? <PlayerCard key={i} player={p} compact /> : <div key={i} className="lu-card-fallback">{n}</div>;
      })}
    </div>
  );

  const theoreticalRow = (lu, i) => {
    const names = [lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5];
    if (!isCurrent) {
      const score = lu.Uyum_Skoru ?? lu.lineup_score ?? 0;
      const meta = [lu.Kapsama != null && `Coverage ${Math.round(lu.Kapsama * 100)}`, lu.Guclu_Rol != null && `${lu.Guclu_Rol} strong roles`].filter(Boolean).join(" · ");
      return <LineupRow key={i} rank={i + 1} fit={score} meta={meta}
        slots={names.filter(Boolean).map(n => ({ name: n }))} />;
    }
    const archs = (lu.Arketipler || "").split(" | ").map(a => a.trim());
    const positional = !!(lu.Pos_PG || lu.PG) || mode === "positional";
    const sl = names.map((n, j) => ({ name: n, arch: archs[j] || "", color: ARCH_HEX[archs[j]], pos: positional ? POSITIONS[j] : null })).filter(s => s.name);
    return <LineupRow key={i} rank={i + 1} fit={lu.lineup_score ?? lu.Uyum_Skoru ?? 0} slots={sl}
      expandBody={<>{cards(sl.map(s => s.name))}</>} />;
  };

  const realRow = (lu, i) => {
    const players = lu.Players?.length ? lu.Players : (lu.GROUP_NAME || "").split(" - ");
    const archetypes = lu.Archetypes || [];
    const net = lu.NET_RATING;
    return (
      <LineupRow key={i} rank={i + 1} fit={lu.fit_score}
        meta={net != null ? `Net ${net > 0 ? "+" : ""}${net.toFixed(1)}` : null}
        slots={players.map((n, j) => ({ name: n, arch: archetypes[j], color: ARCH_HEX[archetypes[j]] }))}
        expandBody={
          <>
            <div className="lu-real-stats">
              {net != null && <span><b style={{ color: net >= 0 ? "#4ade80" : "#f87171" }}>{net > 0 ? "+" : ""}{net.toFixed(1)}</b>Net rating</span>}
              {lu.W_PCT != null && <span><b>{Math.round(lu.W_PCT * 100)}%</b>Win rate</span>}
              {lu.PLUS_MINUS != null && <span><b>{lu.PLUS_MINUS > 0 ? "+" : ""}{lu.PLUS_MINUS}</b>Plus-minus</span>}
              <span><b>{Math.round(lu.MIN || 0)}</b>Minutes together</span>
            </div>
            {cards(players)}
          </>
        } />
    );
  };

  const resultGrade = customResult?.players_data && isCurrent ? computeLineupFit(customResult.players_data)?.grade : null;
  const tint = resultGrade ? GRADE_COLOR[resultGrade] : "#FFB11B";

  return (
    <>
      <SEO title="NBA Lineup Builder"
        description="Build and analyze 5-man NBA lineups from any era. Evaluate real historical lineups by role coverage, archetype balance, and net rating across 40+ seasons."
        path="/basketball/lineups" />
      <div className="lu-page">
        <PageGlow tint={tint} />
        <div className="lu-inner">
          <header className="lu-head">
            <div>
              <h1>Lineups</h1>
              <p>How well five players fit, scored on five pillars</p>
            </div>
            <label className="lu-season">
              <span>Season</span>
              <select value={season} onChange={e => { setSeason(e.target.value); setTab("theoretical"); }} aria-label="Season">
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <PaIcon name="chevron" size={16} color="var(--text-muted)" />
            </label>
          </header>

          <div className="lu-grid">
            <div className="lu-left">
              <section className="lu-panel">
                <span className="lu-h"><i />{t("custom_lineup_title")}{!isCurrent && <em>{season}</em>}</span>
                <div className="lu-slots">
                  {POSITIONS.map((pos, i) => (
                    <SlotSearch key={`${season}-${i}`} pos={pos} value={slots[i]} arch={slotArch[i]}
                      season={season} placeholder={POS_NAME[pos]}
                      onChange={(v, a) => setSlot(i, v, a)} />
                  ))}
                </div>
                <button onClick={evalCustom} className="aura-rating-btn lu-cta">{t("calculate_fit")}</button>
                {customError && <p className="lu-err">{customError}</p>}
              </section>

              <ResultPanel result={customResult} isCurrent={isCurrent} saved={lineupSaved} onSave={saveLineup} />

              {isCurrent && <RoleImpactChart />}
            </div>

            <div className="lu-right">
              <div className="lu-tabs-row">
                <nav className="lu-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === "theoretical"} className={tab === "theoretical" ? "on" : ""}
                    onClick={() => setTab("theoretical")}>{lang === "tr" ? "Teorik" : "Theoretical"}</button>
                  {isCurrent && (
                    <button role="tab" aria-selected={tab === "real"} className={tab === "real" ? "on" : ""}
                      onClick={() => setTab("real")}>{lang === "tr" ? "Gerçek lineup'lar" : "Real lineups"}</button>
                  )}
                </nav>
                {tab === "theoretical" && isCurrent && (
                  <div className="lu-chips">
                    {[["positional", t("positional_mode")], ["any", t("any_mode")]].map(([k, l]) => (
                      <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>
                    ))}
                  </div>
                )}
                {tab === "real" && isCurrent && (
                  <div className="lu-chips">
                    {[["NET_RATING", "Net rating"], ["fit_score", "Fit"], ["MIN", "Minutes"]].map(([k, l]) => (
                      <button key={k} className={realSort === k ? "on" : ""} onClick={() => setRealSort(k)}>{l}</button>
                    ))}
                  </div>
                )}
              </div>

              <p className="lu-note">
                {tab === "real"
                  ? `Real five-man groups with 50+ minutes together. Fit is the archetype score; net rating is what happened on court.${corr?.r != null ? ` Correlation r = ${corr.r} across ${corr.n} lineups.` : ""}`
                  : !isCurrent
                    ? `Historical fit, from component coverage in ${season} player data.`
                    : mode === "positional"
                      ? "Best possible fives from this season's players, exactly one PG · SG · SF · PF · C each."
                      : "Best possible fives from this season's players, any positions."}
              </p>

              <div className="lu-list">
                {tab === "theoretical" && (loading
                  ? <div className="pa-skel-rows" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="pa-skel" style={{ height: 96, borderRadius: 18 }} />)}</div>
                  : topLineups.length ? topLineups.map(theoreticalRow)
                  : <p className="lu-note">No lineup data for {season}.</p>)}
                {tab === "real" && isCurrent && (realLoading
                  ? <div className="pa-skel-rows" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="pa-skel" style={{ height: 96, borderRadius: 18 }} />)}</div>
                  : realLineups.length ? realLineups.map(realRow)
                  : <p className="lu-note">No real lineup data loaded.</p>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
