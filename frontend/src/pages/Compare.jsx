import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "../api";
import RadarProfile from "../components/RadarProfile";
import { useLang } from "../contexts/LanguageContext";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_COLOR = {
  Engine:       "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Ecosystem:    "bg-green-500/20 text-green-300 border-green-500/30",
  Hub:          "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Connector:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Creator:      "bg-rose-500/20 text-rose-300 border-rose-500/30",
  Anchor:       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Spacer:       "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Finisher:     "bg-lime-500/20 text-lime-300 border-lime-500/30",
  Force:        "bg-red-500/20 text-red-300 border-red-500/30",
  Initiator:    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Stopper:      "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Rim Runner": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const TIER_STYLE = {
  Elite:         "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Star:          "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Starter:       "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Role Player": "bg-slate-700/40 text-slate-400 border-slate-600/30",
};

function PlayerSearch({ side, onSelect, lang }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val) => {
    setQuery(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await api.players({ search: val, limit: 8 });
        setResults(d.players || []);
        setOpen(true);
      } catch {}
    }, 280);
  };

  const pick = (p) => {
    setQuery(p.PLAYER_NAME);
    setOpen(false);
    onSelect(p.PLAYER_NAME);
  };

  const label = side === "a"
    ? (lang === "tr" ? "Oyuncu A ara..." : "Search player A...")
    : (lang === "tr" ? "Oyuncu B ara..." : "Search player B...");

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={label}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 bg-slate-900 border border-slate-700 rounded-xl mt-1 overflow-hidden shadow-xl">
          {results.map((p, i) => (
            <button key={i} onClick={() => pick(p)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800 transition-colors text-left">
              <div>
                <div className="text-sm text-white font-medium">{p.PLAYER_NAME}</div>
                <div className="text-[10px] text-slate-500">{p.TEAM_ABBREVIATION} · {p.POSITION}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ARCH_COLOR[p.primary_arch] || "bg-slate-700/30 text-slate-400 border-slate-600/30"}`}>
                {p.primary_arch}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, valA, valB, fmt = (v) => v?.toFixed?.(1) ?? v }) {
  if (valA == null && valB == null) return null;
  const a = valA != null ? Number(valA) : null;
  const b = valB != null ? Number(valB) : null;
  const aWins = a != null && b != null && a > b;
  const bWins = a != null && b != null && b > a;
  return (
    <div className="grid grid-cols-3 items-center py-1.5 border-b border-slate-800/60 text-xs">
      <div className={`text-right pr-3 font-semibold ${aWins ? "text-violet-300" : "text-slate-300"}`}>
        {a != null ? fmt(a) : "—"}
      </div>
      <div className="text-center text-slate-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`text-left pl-3 font-semibold ${bWins ? "text-amber-300" : "text-slate-300"}`}>
        {b != null ? fmt(b) : "—"}
      </div>
    </div>
  );
}

function VSBar({ label, scoreA, scoreB }) {
  const a = (scoreA || 0) * 100;
  const b = (scoreB || 0) * 100;
  const aWins = a > b;
  const bWins = b > a;
  return (
    <div className="flex items-center gap-2 py-1">
      {/* A bar (grows right→left) */}
      <div className="flex-1 flex items-center justify-end gap-1.5">
        <span className={`text-xs font-bold w-8 text-right ${aWins ? "text-violet-300" : "text-slate-400"}`}>
          {Math.round(a)}
        </span>
        <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden flex justify-end">
          <div
            className={`h-full rounded-full transition-all ${aWins ? "bg-violet-500" : "bg-slate-600"}`}
            style={{ width: `${a}%` }}
          />
        </div>
      </div>

      {/* Label */}
      <div className="w-20 text-center text-[10px] text-slate-500 shrink-0">{label}</div>

      {/* B bar (grows left→right) */}
      <div className="flex-1 flex items-center gap-1.5">
        <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${bWins ? "bg-amber-500" : "bg-slate-600"}`}
            style={{ width: `${b}%` }}
          />
        </div>
        <span className={`text-xs font-bold w-8 ${bWins ? "text-amber-300" : "text-slate-400"}`}>
          {Math.round(b)}
        </span>
      </div>
    </div>
  );
}

function PlayerHeader({ detail, loading, side }) {
  if (loading) return <div className="bg-slate-900 rounded-xl p-4 text-center text-slate-500 text-sm animate-pulse">Loading...</div>;
  if (!detail) return (
    <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-6 text-center text-slate-600 text-sm">
      {side === "a" ? "Player A" : "Player B"}
    </div>
  );
  const archColor = ARCH_COLOR[detail.primary_arch] || "bg-slate-700/30 text-slate-400 border-slate-600/30";
  const tierStyle = TIER_STYLE[detail.overall_tier] || "";
  const overallDisplay = detail.overall_score != null ? Math.round(detail.overall_score * 100) : null;
  const nameColor = side === "a" ? "text-violet-300" : "text-amber-300";
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 ${side === "a" ? "border-violet-700/40" : "border-amber-700/40"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`font-bold text-base ${nameColor}`}>{detail.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{detail.team} · {detail.position}</div>
        </div>
        {overallDisplay != null && (
          <div className="text-right">
            <div className={`text-2xl font-black ${nameColor}`}>{overallDisplay}</div>
            <div className="text-[9px] text-slate-500">overall</div>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded border ${archColor}`}>{detail.primary_arch}</span>
        {detail.overall_tier && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tierStyle}`}>{detail.overall_tier}</span>
        )}
        {detail.active_modifiers?.slice(0, 3).map(m => (
          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{m}</span>
        ))}
      </div>
    </div>
  );
}

export default function Compare() {
  const { lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();

  const [detailA, setDetailA] = useState(null);
  const [detailB, setDetailB] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const loadPlayer = async (side, name) => {
    const setDetail  = side === "a" ? setDetailA : setDetailB;
    const setLoading = side === "a" ? setLoadingA : setLoadingB;
    setLoading(true);
    try {
      const data = await api.playerScores(name);
      setDetail(data);
      const p = new URLSearchParams(searchParams);
      p.set(side, name);
      setSearchParams(p, { replace: true });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // URL param'larından initial load
  useEffect(() => {
    const a = searchParams.get("a");
    const b = searchParams.get("b");
    if (a) loadPlayer("a", a);
    if (b) loadPlayer("b", b);
  }, []); // eslint-disable-line

  const bothLoaded = detailA && detailB;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h2 className="text-white font-semibold text-lg">
          {lang === "tr" ? "Oyuncu Karşılaştırma" : "Player Comparison"}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {lang === "tr"
            ? "İki oyuncuyu arketip profili, skor ve istatistik bazında karşılaştır"
            : "Compare two players by archetype profile, scores, and stats"}
        </p>
      </div>

      {/* Arama çifti */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PlayerSearch side="a" onSelect={n => loadPlayer("a", n)} lang={lang} />
        <PlayerSearch side="b" onSelect={n => loadPlayer("b", n)} lang={lang} />
      </div>

      {/* Header kartlar */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PlayerHeader detail={detailA} loading={loadingA} side="a" />
        <PlayerHeader detail={detailB} loading={loadingB} side="b" />
      </div>

      {bothLoaded && (
        <>
          {/* Dual Radar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2 text-center">
              {lang === "tr" ? "Arketip Radar" : "Archetype Radar"}
            </div>
            <RadarProfile
              scores={detailA.scores}
              scores2={detailB.scores}
              name={detailA.name}
              name2={detailB.name}
              primaryArch={detailA.primary_arch}
              primaryArch2={detailB.primary_arch}
            />
          </div>

          {/* Stat karşılaştırma */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-3 text-center">
              {lang === "tr" ? "İstatistik Karşılaştırma" : "Stats Comparison"}
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-3 text-[10px] text-slate-500 mb-1">
              <div className="text-right pr-3 text-violet-400 font-medium truncate">{detailA.name?.split(" ").pop()}</div>
              <div className="text-center"></div>
              <div className="text-left pl-3 text-amber-400 font-medium truncate">{detailB.name?.split(" ").pop()}</div>
            </div>
            {[
              ["PTS", detailA.pts, detailB.pts, (v) => v?.toFixed(1)],
              ["REB", detailA.reb, detailB.reb, (v) => v?.toFixed(1)],
              ["AST", detailA.ast, detailB.ast, (v) => v?.toFixed(1)],
              ["BPM", detailA.bpm, detailB.bpm, (v) => v != null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : null],
              ["GP",  detailA.gp,  detailB.gp,  (v) => v],
              ["Overall", detailA.overall_score, detailB.overall_score, (v) => v != null ? Math.round(v * 100) : null],
            ].map(([label, a, b, fmt]) => (
              <StatCell key={label} label={label} valA={a} valB={b} fmt={fmt} />
            ))}
          </div>

          {/* VS Score bars */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-3 text-center">
              {lang === "tr" ? "Bileşen Skorları" : "Component Scores"}
            </div>
            {/* Column headers */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 text-right text-[10px] text-violet-400 font-medium pr-2 truncate">{detailA.name}</div>
              <div className="w-20 shrink-0" />
              <div className="flex-1 text-left text-[10px] text-amber-400 font-medium pl-2 truncate">{detailB.name}</div>
            </div>
            {CORE.map(c => (
              <VSBar
                key={c}
                label={c}
                scoreA={detailA.scores?.[c]}
                scoreB={detailB.scores?.[c]}
              />
            ))}
            {/* Active modifiers summary */}
            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-violet-400 uppercase tracking-wide mb-1">Modifiers</div>
                <div className="flex flex-wrap gap-1">
                  {(detailA.active_modifiers || []).map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0.5 bg-violet-900/30 text-violet-300 rounded">{m}</span>
                  ))}
                  {!detailA.active_modifiers?.length && <span className="text-[9px] text-slate-600">—</span>}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-amber-400 uppercase tracking-wide mb-1">Modifiers</div>
                <div className="flex flex-wrap gap-1">
                  {(detailB.active_modifiers || []).map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0.5 bg-amber-900/30 text-amber-300 rounded">{m}</span>
                  ))}
                  {!detailB.active_modifiers?.length && <span className="text-[9px] text-slate-600">—</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!detailA && !detailB && (
        <div className="text-center text-slate-600 text-sm py-12">
          {lang === "tr"
            ? "Karşılaştırmak için yukarıdan iki oyuncu ara"
            : "Search two players above to start comparing"}
        </div>
      )}
    </div>
  );
}
