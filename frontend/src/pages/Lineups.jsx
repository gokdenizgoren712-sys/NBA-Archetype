import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api";
import RoleBreakdown from "../components/RoleBreakdown";
import RoleImpactChart from "../components/RoleImpactChart";
import PlayerCard from "../components/PlayerCard";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { Search } from "lucide-react";
import { SEO } from "../hooks/useSEO";
import { computeLineupFit, GRADE_COLOR, PILLAR_LABELS, getEra } from "../utils/lineupScoring";
import "../components/PlayerCard.css";

const SCORE_COLOR = (v) =>
  v >= 0.80 ? "var(--accent)" :
  v >= 0.65 ? "#d97706"       :
              "var(--text-muted)";

// Kart badge/edge-bevel için gerçek hex lazım (var(--accent) CSS custom prop'u
// alfa-suffix ile birleştirilemiyor) — sürekli kalite skalası.
const FIT_HEX = (v) =>
  v >= 0.80 ? "#4ade80" : v >= 0.65 ? "#facc15" : v >= 0.50 ? "#fb923c" : "#f87171";

const POS_COLOR = {
  PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171",
};

// Arketip → renk (Glossary'nin CORE_HEX'iyle aynı palet — site genelinde tutarlı).
const ARCH_HEX = {
  Engine: "#fb923c", Ecosystem: "#4ade80", Hub: "#2dd4bf", Connector: "#c084fc",
  Creator: "#fb7185", Anchor: "#60a5fa", Spacer: "#22d3ee", Finisher: "#a3e635",
  Force: "#f87171", Initiator: "#FFB11B", Stopper: "#d1d5db", "Rim Runner": "#34d399",
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
      <div className="relative flex items-center gap-3 rounded-xl overflow-hidden p-3" style={{ background: "rgba(255,255,255,.03)" }}>
        <span className="aura-glow" style={{ "--aura-color": gradeColor, width: 100, height: 100, left: -20, top: -20 }} />
        <span className="relative font-logo text-4xl font-black" style={{ color: gradeColor, textShadow: `0 0 20px ${gradeColor}80` }}>{fit.grade}</span>
        <div className="relative">
          <div className="font-logo text-lg font-bold tabular-nums" style={{ color: gradeColor }}>{fit.pct}%</div>
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
          const hex = FIT_HEX(v);
          return (
            <div key={key} className="flex items-center gap-2.5">
              <span className="text-[10.5px] w-28 shrink-0 leading-tight whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {label}{extra && <span style={{ color: "var(--text-faint)" }}>{extra}</span>}
              </span>
              <div className="pillar-bar-track flex-1">
                <div className="pillar-bar-fill" style={{ width: `${pct}%`, "--fill-color": hex, "--fill-color-a": hex + "70" }} />
              </div>
              <span className="text-[10px] w-6 text-right font-medium" style={{ color: hex }}>{pct}</span>
            </div>
          );
        })}
      </div>

      {/* Per-player era faktörü */}
      {result.players_data && (
        <div className="pt-2 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
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
    "Chemistry": result.role_fit   ?? result.Denge ?? null,
  };
  const score = result.lineup_score ?? result.Uyum_Skoru ?? 0;
  const nShooters = result.n_shooters;

  return (
    <div className="space-y-1">
      {Object.entries(pillars).map(([k, v]) => {
        if (v == null) return null;
        const pct = Math.round(v * 100);
        const extra = k === "Spacing" && nShooters != null ? ` (${nShooters} shooters)` : "";
        const hex = FIT_HEX(v);
        return (
          <div key={k} className="flex items-center gap-2.5">
            <span className="text-[10.5px] w-28 shrink-0 leading-tight whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              {k}{extra && <span style={{ color: "var(--text-faint)" }}>{extra}</span>}
            </span>
            <div className="pillar-bar-track flex-1">
              <div className="pillar-bar-fill" style={{ width: `${pct}%`, "--fill-color": hex, "--fill-color-a": hex + "70" }} />
            </div>
            <span className="text-[10px] w-6 text-right font-medium" style={{ color: hex }}>{pct}</span>
          </div>
        );
      })}
      <div className="pt-1.5 flex items-center justify-center gap-2 font-semibold mt-1" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Fit</span>
        <span className="text-sm font-bold" style={{ color: FIT_HEX(score) }}>{Math.round(score * 100)}</span>
      </div>
    </div>
  );
}

// Teorik lineup kartı — 2025-26 formatı (Oyuncu_1..5 + pozisyon kartları).
// Kapalıyken rank/skor köşede yüzen bir rozet, arkada 5 organik arketip
// blob'u tek bir sürekli doku gibi birbirine karışıyor (hizası Arketipler/
// Oyuncu_N sırasıyla birebir). Genişleyince aynı 5 slot GERÇEK PlayerCard'a
// dönüşüyor (compact), altında pillar barları.
function LineupCard({ lu, rank, lang, playerMap }) {
  const [expanded, setExpanded] = useState(false);
  const score = lu.lineup_score ?? lu.Uyum_Skoru ?? 0;
  const accent = FIT_HEX(score);
  const names = [lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5];
  const archs = (lu.Arketipler || "").split(" | ").map(a => a.trim());
  const hasPositional = !!(lu.Pos_PG || lu.PG);
  const positions = ["PG", "SG", "SF", "PF", "C"];
  const slots = names.map((name, i) => ({
    name, arch: archs[i] || "",
    pos: hasPositional ? positions[i] : `#${i + 1}`,
    color: ARCH_HEX[archs[i]] || "#9ca3af",
    overall: playerMap?.get(name)?.overall_score,
  })).filter(s => s.name);

  return (
    <div className={`lineup-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-line": accent + "66" }}
      onClick={() => setExpanded(e => !e)}>
      <span className="lineup-card-rank">{rank + 1}</span>
      <div className="lineup-card-badges">
        <span className="lineup-card-score">{Math.round(score * 100)}</span>
        <span className="lineup-chev">▾</span>
      </div>
      {slots.map((s, i) => (
        <span key={i} className="aura-blob lineup-slot-glow"
          style={{ "--slot-color": s.color, left: `${((i + 0.5) / slots.length) * 100}%`, transform: `translateX(-50%) rotate(${i * 41}deg)` }} />
      ))}
      <div className="lineup-slots">
        {slots.map((s, i) => (
          <div key={i} className="lineup-slot">
            <div className="lineup-slot-pos">{s.pos}</div>
            <div className="lineup-slot-name">{s.name}</div>
            {s.overall != null && <div className="lineup-slot-overall">{Math.round(s.overall * 100)}</div>}
          </div>
        ))}
      </div>
      <div className="lineup-card-expand-wrap">
        <div className="lineup-card-expand-inner">
          <div className="lineup-card-body" onClick={e => e.stopPropagation()}>
            <div className="lineup-playercards-row">
              {slots.map((s, i) => {
                const p = playerMap?.get(s.name);
                return p
                  ? <PlayerCard key={i} player={p} compact />
                  : <div key={i} className="lineup-slot-fallback">{s.name}</div>;
              })}
            </div>
            <PillarBreakdown result={lu} lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Tarihsel lineup kartı — boolean vektör formatı (Oyuncu_1..5 + Kapsama / Uyum_Skoru).
// Arketip bilgisi bu formatta yok (bkz. _bool_lineup_compat), o yüzden tek
// genel fit-renkli blob — ama aynı köşe-rozet + çizgisiz yüzey dili.
function HistLineupCard({ lu, rank }) {
  const [expanded, setExpanded] = useState(false);
  const players = [lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5].filter(Boolean);
  const score = lu.Uyum_Skoru ?? lu.lineup_score ?? 0;
  const accent = FIT_HEX(score);

  return (
    <div className={`lineup-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-line": accent + "66" }}
      onClick={() => setExpanded(e => !e)}>
      <span className="aura-blob lineup-card-solo-glow" style={{ "--slot-color": accent }} />
      <span className="lineup-card-rank">{rank + 1}</span>
      <div className="lineup-card-badges">
        <span className="lineup-card-score">{Math.round(score * 100)}</span>
        <span className="lineup-chev">▾</span>
      </div>
      <div className="lineup-card-head">
        <div className="lineup-card-names truncate">{players.join(" · ")}</div>
      </div>
      <div className="lineup-card-expand-wrap">
        <div className="lineup-card-expand-inner">
          <div className="lineup-card-body" onClick={e => e.stopPropagation()}>
            <div className="flex gap-4 text-[10px] pt-2" style={{ color: "var(--text-muted)" }}>
              {lu.Kapsama   != null && <span>Coverage: {Math.round(lu.Kapsama * 100)}</span>}
              {lu.Derinlik  != null && <span>Depth: {Math.round(lu.Derinlik * 100)}</span>}
              {lu.Guclu_Rol != null && <span>Strong roles: {lu.Guclu_Rol}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Gerçek oynanmış lineup kartı — aynı lineup-card kabuğu: köşede yüzen rank/fit
// rozeti, arketip-renkli oyuncu çipleri (Affinity drill panel'deki aynı dil),
// genişleyince gerçek istatistikler + gerçek compact PlayerCard'lar.
function RealLineupCard({ lu, rank, playerMap }) {
  const [expanded, setExpanded] = useState(false);
  const net = lu.NET_RATING;
  const fit = lu.fit_score;
  const netColor = net >= 10 ? "#4ade80" : net >= 0 ? "#60a5fa" : "#f87171";
  const accent = fit != null ? FIT_HEX(fit) : netColor;
  const players = lu.Players?.length ? lu.Players : (lu.GROUP_NAME || "").split(" - ");
  const archetypes = lu.Archetypes || [];

  return (
    <div className={`lineup-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-line": accent + "66" }}
      onClick={() => setExpanded(e => !e)}>
      <span className="aura-blob lineup-card-solo-glow" style={{ "--slot-color": accent }} />
      <span className="lineup-card-rank">{rank + 1}</span>
      <div className="lineup-card-badges">
        {fit != null && <span className="lineup-card-score">{Math.round(fit * 100)}</span>}
        <span className="lineup-chev">▾</span>
      </div>
      <div className="lineup-card-head">
        <div className="flex-1 flex flex-wrap gap-1.5">
          {players.map((p, j) => {
            const arch = archetypes[j];
            const col = ARCH_HEX[arch] || "var(--text-muted)";
            return (
              <span key={j} className="flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ color: col, border: `1px solid ${col}40`, background: `${col}14` }}>
                {arch && <span style={{ width: 5, height: 5, borderRadius: "50%", background: col, display: "inline-block", flexShrink: 0 }} />}
                {p}
              </span>
            );
          })}
        </div>
      </div>
      <div className="lineup-card-expand-wrap">
        <div className="lineup-card-expand-inner">
          <div className="lineup-card-body" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-4 mb-3 pt-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-logo text-base font-bold" style={{ color: netColor }}>{net > 0 ? "+" : ""}{net?.toFixed(1)}</span>
                <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>NET RTG</span>
              </div>
              {lu.W_PCT != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-logo text-base font-bold" style={{ color: "var(--text-primary)" }}>{Math.round(lu.W_PCT * 100)}%</span>
                  <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>Win rate</span>
                </div>
              )}
              {lu.PLUS_MINUS != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-logo text-base font-bold" style={{ color: "var(--text-primary)" }}>{lu.PLUS_MINUS > 0 ? "+" : ""}{lu.PLUS_MINUS}</span>
                  <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>+/−</span>
                </div>
              )}
              <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>{Math.round(lu.MIN || 0)} min together</span>
            </div>
            {playerMap && (
              <div className="lineup-playercards-row" style={{ gridTemplateColumns: `repeat(${players.length}, 1fr)` }}>
                {players.map((name, j) => {
                  const p = playerMap.get(name);
                  return p
                    ? <PlayerCard key={j} player={p} compact />
                    : <div key={j} className="lineup-slot-fallback">{name}</div>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`aura-pill-btn${active ? " active" : ""}`}>
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
      <div className="relative flex items-center gap-2 pb-1" style={{ borderBottom: `1px solid ${query ? "var(--accent-border)" : "rgba(255,255,255,.12)"}` }}>
        <Search size={12} style={{ color: query ? "var(--accent)" : "var(--text-faint)", flexShrink: 0 }} />
        <input value={query} onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs focus:outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="aura-glass absolute top-full left-0 right-0 z-30 rounded-xl mt-1.5 overflow-hidden"
          style={{ boxShadow: "0 14px 30px -10px rgba(0,0,0,.6)" }}>
          {results.map((p, i) => (
            <button key={i} onClick={() => pick(p)}
              className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.06)"}
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
  const { token, isLoggedIn } = useAuth();

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
  const [lineupSaved, setLineupSaved]   = useState(false);
  const [playerMap, setPlayerMap]       = useState(null);

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

  // Teorik VE gerçek lineup satırları genişleyince gerçek PlayerCard göstermek
  // için — lineup havuzu zaten en yüksek overall'lı ~40-60 oyuncudan geliyor,
  // tek seferlik geniş bir çekim herkesi kapsar (bkz. _load_lineup_compat_positional).
  useEffect(() => {
    if ((tab !== "theoretical" && tab !== "real") || !isCurrent || playerMap) return;
    api.players({ limit: 300, sort_by: "overall_score" })
      .then(d => setPlayerMap(new Map((d.players || []).map(p => [p.PLAYER_NAME, p]))))
      .catch(() => {});
  }, [tab, isCurrent, playerMap]);

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
    setCustomResult(null); setCustomError(""); setLineupSaved(false);
    const names = slots.map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { setCustomError(t("enter_min_2")); return; }
    try {
      const r = isCurrent
        ? await api.customLineup(names)
        : await api.historicalCustomLineup(season, names);
      setCustomResult(r);
    } catch (e) { setCustomError(e.message); }
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
          players: names,
          score: fit ? fit.pct / 100 : customResult.lineup_score,
          grade: fit?.grade || "",
          pct: fit?.pct || null,
          label: names.join(" · "),
        }),
      });
      setLineupSaved(true);
    } catch (e) { console.error(e); }
  };

  return (
    <>
    <SEO
      title="NBA Lineup Builder"
      description="Build and analyze 5-man NBA lineups from any era. Evaluate real historical lineups by role coverage, archetype balance, and net rating across 40+ seasons."
      path="/basketball/lineups"
    />
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">

        {/* Season selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Season</span>
          <div className="aura-select-wrap">
            <select value={season} onChange={e => { setSeason(e.target.value); setTab("theoretical"); }}
              className="aura-select accent">
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {!isCurrent && (
            <span className="aura-pill-btn active" style={{ cursor: "default" }}>Historical mode</span>
          )}
        </div>

        {/* Custom lineup — the hero moment of this page, gets the card's punch */}
        <div className="relative aura-glass rounded-2xl p-5 overflow-hidden">
          <span className="aura-glow"
            style={{ "--aura-color": customResult ? (GRADE_COLOR[customResult?.players_data ? computeLineupFit(customResult.players_data).grade : ""] || "#FFB11B") : "#FFB11B",
              width: 260, height: 260, left: "50%", top: -80, marginLeft: -130 }} />
          <h2 className="relative font-logo font-bold mb-4 text-sm uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
            {t("custom_lineup_title")}
            {!isCurrent && <span className="ml-2 text-xs font-normal normal-case" style={{ color: "var(--text-muted)" }}>{season}</span>}
          </h2>
          <div className="relative flex gap-6 flex-wrap">
            <div className="flex-1 min-w-[220px] space-y-3">
              {slots.map((v, i) => (
                isCurrent
                  ? <HistPlayerSearch key={i} value={v} onChange={val => setSlot(i, val)}
                      season="2025-26" placeholder={`${t("position")} ${i + 1}…`} />
                  : <HistPlayerSearch key={i} value={v} onChange={val => setSlot(i, val)}
                      season={season} placeholder={`Player ${i + 1}…`} />
              ))}
              <button onClick={evalCustom} className="aura-rating-btn">
                {t("calculate_fit")}
              </button>
              {customError && <p className="text-red-400 text-xs mt-2">{customError}</p>}
            </div>

            {customResult && (
              <div className="flex-1 min-w-[220px] space-y-3">
                {isCurrent
                  ? <TwoStageResult result={customResult} />
                  : <PillarBreakdown result={customResult} lang={lang} />
                }
                <button onClick={saveLineup} disabled={lineupSaved}
                  className={`aura-pill-btn${lineupSaved ? " active" : ""} w-full justify-center`}>
                  {lineupSaved ? "★ Saved" : "☆ Save Lineup"}
                </button>
              </div>
            )}
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
              <div className="aura-select-wrap">
                <select value={realSort} onChange={e => setRealSort(e.target.value)} className="aura-select">
                  <option value="NET_RATING">NET_RATING ↓</option>
                  <option value="fit_score">Fit Score ↓</option>
                  <option value="MIN">Minutes ↓</option>
                </select>
              </div>
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
                      ? <LineupCard key={i} lu={lu} rank={i} lang={lang} playerMap={playerMap} />
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
                  {realLineups.map((lu, i) => <RealLineupCard key={i} lu={lu} rank={i} playerMap={playerMap} />)}
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
