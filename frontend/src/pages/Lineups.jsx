import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api";
import RoleBreakdown from "../components/RoleBreakdown";
import RoleImpactChart from "../components/RoleImpactChart";
import { explainLineup } from "../utils/lineupExplain";
import { useLang } from "../contexts/LanguageContext";
import { Search } from "lucide-react";
import { SEO } from "../hooks/useSEO";
import { computeLineupFit, GRADE_COLOR, PILLAR_LABELS, getEra } from "../utils/lineupScoring";

const SCORE_COLOR = (v) =>
  v >= 0.80 ? "var(--accent)" :
  v >= 0.65 ? "#d97706"       :
              "var(--text-muted)";

const POS_COLOR = {
  PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171",
};

// ── İki aşamalı skor (2025-26 custom lineup için) ────────────────────────────
function TwoStageResult({ result }) {
  const fit = useMemo(() => {
    if (!result?.players_data) return null;
    return computeLineupFit(result.players_data);
  }, [result]);

  // Tarihsel / fallback: basit pillar göster
  if (!fit) return <PillarBreakdown result={result} />;

  const gradeColor = GRADE_COLOR[fit.grade] || "var(--text-muted)";

  return (
    <div className="space-y-3">
      {/* Grade + Skor */}
      <div className="flex items-center gap-3">
        <span className="text-4xl font-black" style={{ color: gradeColor }}>{fit.grade}</span>
        <div>
          <div className="text-lg font-bold" style={{ color: gradeColor }}>{fit.pct}%</div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Quality {Math.round(fit.avgQuality * 100)} · Coverage {Math.round(fit.coverage * 100)} · Fit {Math.round(fit.roleFit * 100)}
          </div>
        </div>
      </div>

      {/* 4 Pillar barları */}
      <div className="space-y-1.5">
        {Object.entries(PILLAR_LABELS).map(([key, label]) => {
          const v = fit[key];
          const pct = Math.round(v * 100);
          const extra = key === "spacing" ? ` (${fit.nShooters}×)` : "";
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] w-20 shrink-0" style={{ color: "var(--text-muted)" }}>
                {label}{extra}
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface)" }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: SCORE_COLOR(v) }} />
              </div>
              <span className="text-[10px] w-6 text-right font-medium" style={{ color: SCORE_COLOR(v) }}>{pct}</span>
            </div>
          );
        })}
      </div>

      {/* Per-player era faktörü */}
      {result.players_data && (
        <div className="border-t pt-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
          {result.players_data.map((p, i) => {
            const pf = fit.perPlayer[i];
            if (!pf) return null;
            const eraLabel = pf.era?.short || "";
            const ef = pf.eraFactor;
            const efColor = ef >= 1.05 ? "#4ade80" : ef <= 0.88 ? "#f87171" : "var(--text-muted)";
            return (
              <div key={p.name} className="flex items-center justify-between text-[10px]">
                <span style={{ color: "var(--text-primary)" }}>{p.name}</span>
                <span className="flex items-center gap-1">
                  <span style={{ color: "var(--text-muted)" }}>{p.primary_arch}</span>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ color: efColor }}>{eraLabel} ×{ef.toFixed(2)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tarihsel / basit pillar breakdown ─────────────────────────────────────────
function PillarBreakdown({ result, lang = "en" }) {
  if (!result) return null;
  const pillars = result.pillar_breakdown || {
    Creation:    result.creation   ?? null,
    Spacing:     result.spacing    ?? null,
    Defense:     result.defense    ?? null,
    Finishing:   result.finishing  ?? null,
    "Role Fit":  result.role_fit   ?? result.Denge ?? null,
  };
  const score = result.lineup_score ?? result.Uyum_Skoru ?? 0;
  const nShooters = result.n_shooters;

  return (
    <div className="space-y-1">
      {Object.entries(pillars).map(([k, v]) => {
        if (v == null) return null;
        const pct = Math.round(v * 100);
        const extra = k === "Spacing" && nShooters != null ? ` (${nShooters} shooters)` : "";
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[10px] w-20 shrink-0" style={{ color: "var(--text-muted)" }}>
              {k}{extra}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SCORE_COLOR(v) }} />
            </div>
            <span className="text-[10px] w-6 text-right" style={{ color: SCORE_COLOR(v) }}>{pct}</span>
          </div>
        );
      })}
      <div className="border-t pt-1.5 flex justify-between font-semibold mt-1" style={{ borderColor: "var(--border)" }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Fit</span>
        <span className="text-sm font-bold" style={{ color: SCORE_COLOR(score) }}>{Math.round(score * 100)}</span>
      </div>
    </div>
  );
}

// Teorik lineup kartı — 2025-26 formatı (Oyuncu_1..5 + pozisyon kartları)
function LineupCard({ lu, rank, t, lang }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 p-4 rounded"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs w-5" style={{ color: "var(--text-faint)" }}>{rank + 1}</span>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {[lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5]
              .filter(Boolean).join(" · ")}
          </span>
        </div>
        {(lu.Pos_PG || lu.PG) && (
          <div className="flex flex-wrap gap-1 ml-7 mt-1">
            {[["PG", lu.Pos_PG || lu.PG], ["SG", lu.Pos_SG || lu.SG], ["SF", lu.Pos_SF || lu.SF],
              ["PF", lu.Pos_PF || lu.PF], ["C", lu.Pos_C || lu.C]].map(([pos, name]) =>
              name ? (
                <span key={pos} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ color: POS_COLOR[pos] || "var(--text-muted)", border: `1px solid ${POS_COLOR[pos] || "var(--border)"}50` }}>
                  {pos}: {name}
                </span>
              ) : null
            )}
          </div>
        )}
        {lu.Arketipler && (
          <div className="text-xs ml-7 mt-0.5" style={{ color: "var(--text-muted)" }}>{lu.Arketipler}</div>
        )}
        <div className="text-[10px] ml-7 mt-1.5 leading-relaxed max-w-xl" style={{ color: "var(--text-muted)" }}>
          {explainLineup(lu, lang)}
        </div>
      </div>
      <div className="flex flex-col gap-2 ml-7 sm:ml-0 shrink-0 w-52">
        <PillarBreakdown result={lu} lang={lang} />
      </div>
    </div>
  );
}

// Tarihsel lineup kartı — boolean vektör formatı (Oyuncu_1..5 + Kapsama / Uyum_Skoru)
function HistLineupCard({ lu, rank }) {
  const players = [lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5].filter(Boolean);
  const score = lu.Uyum_Skoru ?? lu.lineup_score ?? 0;
  return (
    <div className="flex items-start gap-4 p-4 rounded"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <span className="text-xs w-5 shrink-0 mt-0.5" style={{ color: "var(--text-faint)" }}>{rank + 1}</span>
      <div className="flex-1">
        <div className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          {players.join(" · ")}
        </div>
        <div className="flex gap-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {lu.Kapsama   != null && <span>Coverage: {Math.round(lu.Kapsama * 100)}</span>}
          {lu.Derinlik  != null && <span>Depth: {Math.round(lu.Derinlik * 100)}</span>}
          {lu.Guclu_Rol != null && <span>Strong roles: {lu.Guclu_Rol}</span>}
        </div>
      </div>
      <div className="shrink-0 text-center">
        <div className="text-lg font-bold" style={{ color: SCORE_COLOR(score) }}>
          {Math.round(score * 100)}
        </div>
        <div className="text-[8px]" style={{ color: "var(--text-faint)" }}>Fit</div>
      </div>
    </div>
  );
}

function RealLineupCard({ lu, rank }) {
  const net = lu.NET_RATING;
  const fit = lu.fit_score;
  const netColor = net >= 10 ? "#34d399" : net >= 0 ? "var(--accent)" : "#f87171";
  const players = (lu.GROUP_NAME || "").split(" - ");
  return (
    <div className="flex items-center gap-4 p-4 rounded"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <span className="text-xs w-6 shrink-0" style={{ color: "var(--text-faint)" }}>{rank + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-1 mb-1">
          {players.map((p, i) => (
            <span key={i} className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              {p}{i < players.length - 1 ? " ·" : ""}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
          <span>{Math.round(lu.MIN || 0)} min</span>
          {lu.PLUS_MINUS != null && <span>+/−: {lu.PLUS_MINUS > 0 ? "+" : ""}{lu.PLUS_MINUS}</span>}
        </div>
      </div>
      <div className="flex gap-4 shrink-0">
        {fit != null && (
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: SCORE_COLOR(fit) }}>{Math.round(fit * 100)}</div>
            <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>Fit</div>
          </div>
        )}
        {net != null && (
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: netColor }}>{net > 0 ? "+" : ""}{net.toFixed(1)}</div>
            <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>NET RTG</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className="px-4 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: 6,
      }}>
      {children}
    </button>
  );
}

// Player search input for custom lineup (season-aware)
function HistPlayerSearch({ value, onChange, season, placeholder }) {
  const [query, setQuery]     = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const timer = useRef(null);
  const ref   = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const handleChange = (val) => {
    setQuery(val);
    onChange(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await api.historical(season, { search: val, limit: 8 });
        setResults(d.players || []);
        setOpen(true);
      } catch {}
    }, 280);
  };

  const pick = (p) => { setQuery(p.PLAYER_NAME); onChange(p.PLAYER_NAME); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input value={query} onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded pl-7 pr-2 py-2 text-xs focus:outline-none"
          style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 rounded mt-0.5 overflow-hidden shadow-lg"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {results.map((p, i) => (
            <button key={i} onClick={() => pick(p)}
              className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{p.PLAYER_NAME}</span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.TEAM_ABBREVIATION}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Lineups() {
  const { t, lang } = useLang();

  const [seasons, setSeasons]           = useState(["2025-26"]);
  const [season, setSeason]             = useState("2025-26");
  const [topLineups, setTopLineups]     = useState([]);
  const [loading, setLoading]           = useState(false);
  const [slots, setSlots]               = useState(["", "", "", "", ""]);
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError]   = useState("");
  const [mode, setMode]                 = useState("positional");
  const [tab, setTab]                   = useState("theoretical");
  const [realLineups, setRealLineups]   = useState([]);
  const [realLoading, setRealLoading]   = useState(false);
  const [realSort, setRealSort]         = useState("NET_RATING");
  const [corr, setCorr]                 = useState(null);

  const isCurrent = season === "2025-26";

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => {});
  }, []);

  // Teorik lineup'ları sezon değişince yükle
  useEffect(() => {
    if (tab !== "theoretical") return;
    setLoading(true);
    setTopLineups([]);
    const p = isCurrent
      ? api.lineupCompat({ limit: 50, positional: mode === "positional" ? 1 : 0, unique: 1 })
      : api.historicalLineup(season, 30);
    p.then(d => setTopLineups(d.lineups || [])).catch(console.error).finally(() => setLoading(false));
  }, [season, mode, tab]); // eslint-disable-line

  useEffect(() => {
    if (tab !== "real" || !isCurrent) return;
    setRealLoading(true);
    api.realLineups({ limit: 50, sort_by: realSort, min_min: 50 })
      .then(d => setRealLineups(d.lineups || []))
      .catch(console.error)
      .finally(() => setRealLoading(false));
    if (!corr) {
      fetch("/api/lineups/correlation").then(r => r.json()).then(setCorr).catch(() => {});
    }
  }, [tab, realSort, isCurrent]); // eslint-disable-line

  // Sezon değişince custom sıfırla
  useEffect(() => { setSlots(["","","","",""]); setCustomResult(null); setCustomError(""); }, [season]);

  const setSlot = (i, v) => setSlots(prev => { const a = [...prev]; a[i] = v; return a; });

  const evalCustom = async () => {
    setCustomResult(null); setCustomError("");
    const names = slots.map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { setCustomError(t("enter_min_2")); return; }
    try {
      const r = isCurrent
        ? await api.customLineup(names)
        : await api.historicalCustomLineup(season, names);
      setCustomResult(r);
    } catch (e) { setCustomError(e.message); }
  };

  return (
    <>
    <SEO
      title="NBA Lineup Builder"
      description="Build and analyze 5-man NBA lineups from any era. Evaluate real historical lineups by role coverage, archetype balance, and net rating across 40+ seasons."
      path="/lineups"
    />
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Season selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Season</span>
          <select value={season} onChange={e => { setSeason(e.target.value); setTab("theoretical"); }}
            className="rounded px-3 py-1.5 text-sm focus:outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!isCurrent && (
            <span className="text-xs px-2 py-0.5 rounded"
              style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
              Historical mode
            </span>
          )}
        </div>

        {/* Custom lineup */}
        <div className="p-5 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <h2 className="font-semibold mb-3 text-sm" style={{ color: "var(--text-primary)" }}>
            {t("custom_lineup_title")}
            {!isCurrent && <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>{season}</span>}
          </h2>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              {slots.map((v, i) => (
                isCurrent
                  ? <HistPlayerSearch key={i} value={v} onChange={val => setSlot(i, val)}
                      season="2025-26" placeholder={`${t("position")} ${i + 1}…`} />
                  : <HistPlayerSearch key={i} value={v} onChange={val => setSlot(i, val)}
                      season={season} placeholder={`Player ${i + 1}…`} />
              ))}
            </div>
            <div className="flex flex-col justify-between w-44">
              <button onClick={evalCustom}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#000" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                {t("calculate_fit")}
              </button>
              {customError && <p className="text-red-400 text-xs mt-2">{customError}</p>}
              {customResult && (
                <div className="p-3 rounded space-y-1.5 text-sm mt-2"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  {isCurrent
                    ? <TwoStageResult result={customResult} />
                    : <PillarBreakdown result={customResult} lang={lang} />
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Role impact chart — sadece güncel sezon */}
        {isCurrent && <RoleImpactChart />}

        {/* Top lineups */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-2">
              <TabBtn active={tab === "theoretical"} onClick={() => setTab("theoretical")}>
                {lang === "tr" ? "Teorik" : "Theoretical"}
              </TabBtn>
              {isCurrent && (
                <TabBtn active={tab === "real"} onClick={() => setTab("real")}>
                  {lang === "tr" ? "Gerçek Lineup'lar" : "Real Lineups"}
                </TabBtn>
              )}
            </div>

            {tab === "theoretical" && isCurrent && (
              <div className="flex gap-2">
                {[["positional", t("positional_mode")], ["any", t("any_mode")]].map(([k, l]) => (
                  <TabBtn key={k} active={mode === k} onClick={() => setMode(k)}>{l}</TabBtn>
                ))}
              </div>
            )}

            {tab === "real" && isCurrent && (
              <select value={realSort} onChange={e => setRealSort(e.target.value)}
                className="rounded px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <option value="NET_RATING">NET_RATING ↓</option>
                <option value="fit_score">Fit Score ↓</option>
                <option value="MIN">Minutes ↓</option>
              </select>
            )}
          </div>

          {tab === "theoretical" && (
            <>
              {isCurrent && mode === "positional" && (
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{t("positional_note")}</p>
              )}
              {!isCurrent && (
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                  Historical lineup fit — based on component coverage from {season} player data.
                </p>
              )}
              {loading ? (
                <div className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>{t("loading")}</div>
              ) : (
                <div className="space-y-2">
                  {topLineups.map((lu, i) => (
                    isCurrent
                      ? <LineupCard key={i} lu={lu} rank={i} t={t} lang={lang} />
                      : <HistLineupCard key={i} lu={lu} rank={i} />
                  ))}
                  {topLineups.length === 0 && !loading && (
                    <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                      No data for {season}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "real" && isCurrent && (
            <>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                {`Real 5-man groups with ≥50 min played — fit score is theoretical archetype compatibility, NET_RATING is on-court data.${corr?.r != null ? ` r=${corr.r} (n=${corr.n})` : ""}`}
              </p>
              {realLoading ? (
                <div className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>{t("loading")}</div>
              ) : (
                <div className="space-y-2">
                  {realLineups.map((lu, i) => <RealLineupCard key={i} lu={lu} rank={i} />)}
                  {realLineups.length === 0 && (
                    <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                      No data — is the API running?
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
