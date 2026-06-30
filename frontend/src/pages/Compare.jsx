import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "../api";
import RadarProfile from "../components/RadarProfile";
import { useLang } from "../contexts/LanguageContext";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_COLOR = {
  Engine: "#fb923c", Ecosystem: "#f59e0b", Hub: "#34d399",
  Connector: "#38bdf8", Creator: "#a78bfa", Anchor: "#60a5fa",
  Spacer: "#6ee7b7", Finisher: "#f472b6", Force: "#ef4444",
  Initiator: "#facc15", Stopper: "#94a3b8", "Rim Runner": "#4ade80",
};

const A_COLOR = "#f59e0b";
const B_COLOR = "#60a5fa";

function SeasonSelect({ value, onChange, seasons }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded px-3 py-2 text-xs focus:outline-none"
      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
      {seasons.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function PlayerSearch({ side, season, onSelect, lang }) {
  const [query, setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);
  const timer = useRef(null);
  const ref   = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sezon değişince arama sıfırla
  useEffect(() => { setQuery(""); setResults([]); setOpen(false); }, [season]);

  const handleChange = (val) => {
    setQuery(val);
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

  const pick = (p) => { setQuery(p.PLAYER_NAME); setOpen(false); onSelect(p.PLAYER_NAME); };
  const sideColor = side === "a" ? A_COLOR : B_COLOR;
  const label = side === "a"
    ? (lang === "tr" ? "Oyuncu A ara..." : "Search player A...")
    : (lang === "tr" ? "Oyuncu B ara..." : "Search player B...");

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input value={query} onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={label}
          className="w-full rounded pl-8 pr-3 py-2.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: `1px solid ${sideColor}50` }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 rounded mt-1 overflow-hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {results.map((p, i) => (
            <button key={i} onClick={() => pick(p)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.PLAYER_NAME}</div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {p.TEAM_ABBREVIATION} · {p.POSITION}
                </div>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ color: ARCH_COLOR[p.primary_arch] || "var(--accent)", border: `1px solid ${ARCH_COLOR[p.primary_arch] || "var(--accent)"}50` }}>
                {p.primary_arch}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, valA, valB, fmt = (v) => v?.toFixed?.(1) ?? v, higherBetter = true }) {
  if (valA == null && valB == null) return null;
  const a = valA != null ? Number(valA) : null;
  const b = valB != null ? Number(valB) : null;
  const aWins = a != null && b != null && (higherBetter ? a > b : a < b);
  const bWins = a != null && b != null && (higherBetter ? b > a : b < a);
  return (
    <div className="grid grid-cols-3 items-center py-1.5 border-b text-xs" style={{ borderColor: "var(--border)" }}>
      <div className="text-right pr-3 font-semibold" style={{ color: aWins ? A_COLOR : "var(--text-primary)" }}>
        {a != null ? fmt(a) : "—"}
      </div>
      <div className="text-center text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-left pl-3 font-semibold" style={{ color: bWins ? B_COLOR : "var(--text-primary)" }}>
        {b != null ? fmt(b) : "—"}
      </div>
    </div>
  );
}

function VSBar({ label, scoreA, scoreB }) {
  const a = (scoreA || 0) * 100;
  const b = (scoreB || 0) * 100;
  const aWins = a > b, bWins = b > a;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 flex items-center justify-end gap-1.5">
        <span className="text-xs font-bold w-8 text-right" style={{ color: aWins ? A_COLOR : "var(--text-muted)" }}>
          {Math.round(a)}
        </span>
        <div className="w-24 rounded-full h-1.5 overflow-hidden flex justify-end" style={{ background: "var(--bg-elevated)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${a}%`, background: aWins ? A_COLOR : "var(--border)" }} />
        </div>
      </div>
      <div className="w-20 text-center text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="flex-1 flex items-center gap-1.5">
        <div className="w-24 rounded-full h-1.5 overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${b}%`, background: bWins ? B_COLOR : "var(--border)" }} />
        </div>
        <span className="text-xs font-bold w-8" style={{ color: bWins ? B_COLOR : "var(--text-muted)" }}>
          {Math.round(b)}
        </span>
      </div>
    </div>
  );
}

function PlayerHeader({ detail, loading, side, season }) {
  const sideColor = side === "a" ? A_COLOR : B_COLOR;
  if (loading) return (
    <div className="p-4 rounded animate-pulse" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="h-4 rounded w-32 mb-2" style={{ background: "var(--border)" }} />
      <div className="h-3 rounded w-20" style={{ background: "var(--border)" }} />
    </div>
  );
  if (!detail) return (
    <div className="p-6 rounded text-center border-dashed"
      style={{ border: `1px dashed ${sideColor}40`, color: "var(--text-faint)" }}>
      {side === "a" ? "Player A" : "Player B"}
    </div>
  );
  const archColor = ARCH_COLOR[detail.primary_arch] || "var(--accent)";
  const overall = detail.overall_score != null ? Math.round(detail.overall_score * 100) : null;
  return (
    <div className="p-4 rounded" style={{ background: "var(--bg-elevated)", border: `1px solid ${sideColor}40` }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-base" style={{ color: sideColor }}>{detail.name}</div>
          <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            {detail.team} · {detail.position}
            {detail.season && detail.season !== "2025-26" && (
              <span className="px-1.5 py-0.5 rounded text-[9px]"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                {detail.season}
              </span>
            )}
          </div>
        </div>
        {overall != null && (
          <div className="text-right">
            <div className="text-2xl font-black" style={{ color: sideColor }}>{overall}</div>
            <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>overall</div>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ color: archColor, border: `1px solid ${archColor}50`, background: `${archColor}15` }}>
          {detail.primary_arch}
        </span>
        {detail.overall_tier && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {detail.overall_tier}
          </span>
        )}
        {detail.active_modifiers?.slice(0, 3).map(m => (
          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

export default function Compare() {
  const { lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();

  const [seasons, setSeasons]   = useState(["2025-26"]);
  const [seasonA, setSeasonA]   = useState("2025-26");
  const [seasonB, setSeasonB]   = useState("2025-26");
  const [detailA, setDetailA]   = useState(null);
  const [detailB, setDetailB]   = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  // Sezonları yükle
  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => {});
  }, []);

  const loadPlayer = async (side, name, season) => {
    const setDetail  = side === "a" ? setDetailA : setDetailB;
    const setLoading = side === "a" ? setLoadingA : setLoadingB;
    setLoading(true);
    try {
      const data = await api.historicalPlayer(season, name);
      setDetail(data);
      const p = new URLSearchParams(searchParams);
      p.set(side, name);
      p.set(side + "s", season);
      setSearchParams(p, { replace: true });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // URL params'tan restore
  useEffect(() => {
    const a  = searchParams.get("a");
    const b  = searchParams.get("b");
    const as_ = searchParams.get("as") || "2025-26";
    const bs_ = searchParams.get("bs") || "2025-26";
    if (a) { setSeasonA(as_); loadPlayer("a", a, as_); }
    if (b) { setSeasonB(bs_); loadPlayer("b", b, bs_); }
  }, []); // eslint-disable-line

  const bothLoaded = detailA && detailB;

  const bpmFmt = (v) => v != null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-5">
          <h2 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
            {lang === "tr" ? "Oyuncu Karşılaştırma" : "Player Comparison"}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {lang === "tr"
              ? "Farklı eralardan iki oyuncuyu karşılaştır — sezon bağımsız"
              : "Compare players across eras — each player can be from a different season"}
          </p>
        </div>

        {/* Season selectors */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <SeasonSelect value={seasonA} onChange={s => { setSeasonA(s); setDetailA(null); }} seasons={seasons} />
          <SeasonSelect value={seasonB} onChange={s => { setSeasonB(s); setDetailB(null); }} seasons={seasons} />
        </div>

        {/* Player search */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <PlayerSearch side="a" season={seasonA} onSelect={n => loadPlayer("a", n, seasonA)} lang={lang} />
          <PlayerSearch side="b" season={seasonB} onSelect={n => loadPlayer("b", n, seasonB)} lang={lang} />
        </div>

        {/* Player headers */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <PlayerHeader detail={detailA} loading={loadingA} side="a" season={seasonA} />
          <PlayerHeader detail={detailB} loading={loadingB} side="b" season={seasonB} />
        </div>

        {bothLoaded && (
          <>
            {/* Dual Radar */}
            <div className="p-4 rounded mb-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-2 text-center" style={{ color: "var(--text-faint)" }}>
                Archetype Radar
              </div>
              <RadarProfile
                scores={detailA.scores} scores2={detailB.scores}
                name={detailA.name} name2={detailB.name}
                primaryArch={detailA.primary_arch} primaryArch2={detailB.primary_arch}
              />
            </div>

            {/* Stats */}
            <div className="p-4 rounded mb-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-3 text-center" style={{ color: "var(--text-faint)" }}>
                Stats
              </div>
              <div className="grid grid-cols-3 text-[10px] mb-1">
                <div className="text-right pr-3 font-medium" style={{ color: A_COLOR }}>
                  {detailA.name?.split(" ").pop()}
                  {seasonA !== "2025-26" && <span className="ml-1 opacity-60">'{seasonA.slice(2,4)}</span>}
                </div>
                <div />
                <div className="text-left pl-3 font-medium" style={{ color: B_COLOR }}>
                  {detailB.name?.split(" ").pop()}
                  {seasonB !== "2025-26" && <span className="ml-1 opacity-60">'{seasonB.slice(2,4)}</span>}
                </div>
              </div>
              <StatCell label="PTS"     valA={detailA.pts}          valB={detailB.pts}          fmt={(v) => v?.toFixed(1)} />
              <StatCell label="REB"     valA={detailA.reb}          valB={detailB.reb}          fmt={(v) => v?.toFixed(1)} />
              <StatCell label="AST"     valA={detailA.ast}          valB={detailB.ast}          fmt={(v) => v?.toFixed(1)} />
              <StatCell label="BPM"     valA={detailA.bpm}          valB={detailB.bpm}          fmt={bpmFmt} />
              <StatCell label="OBPM"    valA={detailA.obpm}         valB={detailB.obpm}         fmt={bpmFmt} />
              <StatCell label="DBPM"    valA={detailA.dbpm}         valB={detailB.dbpm}         fmt={bpmFmt} />
              <StatCell label="GP"      valA={detailA.gp}           valB={detailB.gp}           fmt={(v) => v} />
              <StatCell label="Overall" valA={detailA.overall_score} valB={detailB.overall_score} fmt={(v) => v != null ? Math.round(v * 100) : null} />
            </div>

            {/* VS bars */}
            <div className="p-4 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-3 text-center" style={{ color: "var(--text-faint)" }}>
                Component Scores
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 text-right text-[10px] font-medium pr-2 truncate" style={{ color: A_COLOR }}>{detailA.name}</div>
                <div className="w-20 shrink-0" />
                <div className="flex-1 text-left text-[10px] font-medium pl-2 truncate" style={{ color: B_COLOR }}>{detailB.name}</div>
              </div>
              {CORE.map(c => (
                <VSBar key={c} label={c} scoreA={detailA.scores?.[c]} scoreB={detailB.scores?.[c]} />
              ))}
              <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-2" style={{ borderColor: "var(--border)" }}>
                {[["a", detailA, A_COLOR], ["b", detailB, B_COLOR]].map(([side, detail, color]) => (
                  <div key={side}>
                    <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color }}>Modifiers</div>
                    <div className="flex flex-wrap gap-1">
                      {(detail.active_modifiers || []).map(m => (
                        <span key={m} className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>{m}</span>
                      ))}
                      {!detail.active_modifiers?.length && (
                        <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!detailA && !detailB && (
          <div className="text-center py-16 text-sm" style={{ color: "var(--text-faint)" }}>
            {lang === "tr"
              ? "Sezon seçip iki oyuncu ara, era'lar arası karşılaştır"
              : "Select a season and search two players to compare across eras"}
          </div>
        )}
      </div>
    </div>
  );
}
