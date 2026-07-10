import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import { NCAAIcon } from "../components/LeagueIcons";
import PlayerCard from "../components/PlayerCard";
import ScoreBar from "../components/ScoreBar";
import RadarProfile from "../components/RadarProfile";
import SplitPane from "../components/SplitPane";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = ["","PG","SG","SF","PF","C"];
const NCAA_COLOR = "#3D7EC9";   // navy tint — dark/light iki temada da okunur

const POS_COLOR = {
  PG: "text-violet-400", SG: "text-blue-400",
  SF: "text-emerald-400", PF: "text-orange-400", C: "text-red-400",
};

function topPct(pct) {
  if (pct == null) return null;
  const p = Math.round(pct * 100);
  return p >= 99 ? "<1%" : `${100 - p}%`;
}

/* ── NCAA detail panel ───────────────────────────────────────────── */
function NCAADetailPanel({ selected, detail, tab, setTab }) {
  if (!selected) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {selected.PLAYER_NAME}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {detail?.position && (
                <span className={`text-[10px] font-mono font-medium ${POS_COLOR[detail.position] || ""}`}>
                  {detail.position}
                </span>
              )}
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {selected.TEAM_ABBREVIATION}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: "rgba(61,126,201,.15)", color: NCAA_COLOR, border: "1px solid rgba(61,126,201,.3)" }}>
                NCAA
              </span>
            </div>
            {/* NCAA-özel: konferans · sınıf · yaş */}
            {(detail?.conference || detail?.class || detail?.age != null) && (
              <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                {[detail.conference, detail.class, detail.age != null ? `${detail.age}y` : null]
                  .filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          {detail?.overall_score != null && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {Math.round(detail.overall_score * 100)}
              </div>
              {detail.overall_pct != null && (
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  top {topPct(detail.overall_pct)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
        {[["radar", "Radar"], ["scores", "Scores"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
            }}>{l}</button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!detail ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : (
          <>
            {selected?.GP != null && Number(selected.GP) < 15 && (
              <div className="mx-4 mt-3 px-3 py-1.5 rounded text-[11px]"
                style={{ background: "rgba(245,158,11,.10)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.25)" }}>
                ⚠ Small sample ({selected.GP} games)
              </div>
            )}

            {tab === "radar" && (
              <div className="p-4">
                <RadarProfile scores={detail.scores} name={detail.name} primaryArch={detail.primary_arch}
                  margin={detail.confidence_margin || 0} />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {["PTS","REB","AST","GP"].map(k => {
                    const val = selected[k];
                    return (
                      <div key={k} className="text-center p-2 rounded"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                          {k === "GP" ? (val ?? "—") : val != null ? Number(val).toFixed(1) : "—"}
                        </div>
                        <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "var(--text-faint)" }}>{k}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Archetype: </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{detail.primary_arch}</span>
                </div>
              </div>
            )}

            {tab === "scores" && (
              <div className="p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
                  Core Archetypes
                </div>
                {CORE.map(c => (
                  <ScoreBar key={c} label={c} value={detail.scores?.[c] || 0}
                    highlight={c === detail.primary_arch}
                    margin={detail.confidence_margin || 0} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function NCAAPage() {
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pos, setPos]                 = useState("");
  const [arch, setArch]               = useState("");
  const [sortBy, setSortBy]           = useState("overall_score");

  const [players, setPlayers] = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData]   = useState(false);
  const debounceRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [tab, setTab]           = useState("radar");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 80, sort_by: sortBy };
      if (search) params.search   = search;
      if (pos)    params.position = pos;
      if (arch)   params.arch     = arch;
      const data = await api.ncaaPlayers(params);
      if (data.coming_soon) { setNoData(true); setPlayers([]); setTotal(0); }
      else {
        setNoData(false);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error(e);
      setNoData(true);
    }
    setLoading(false);
  }, [search, pos, arch, sortBy]);

  useEffect(() => { load(); }, [load]);

  const openPlayer = async (p) => {
    setSelected(p); setDetail(null); setTab("radar");
    try {
      const sc = await api.ncaaPlayerScores(p.PLAYER_NAME);
      setDetail(sc);
    } catch (e) { console.error(e); }
  };

  const clearFilters = () => { setSearch(""); setSearchInput(""); setPos(""); setArch(""); };
  const hasFilters = search || pos || arch;

  return (
    <>
    <SEO
      title="NCAA D-I — NBA Archetype"
      description="NCAA Division I college basketball player archetype profiles — engine, anchor, spacer and more, scored within league context."
      path="/ncaa"
    />
    <SplitPane
      detail={selected ? (
        <NCAADetailPanel selected={selected} detail={detail} tab={tab} setTab={setTab} />
      ) : null}
      onClose={() => { setSelected(null); setDetail(null); }}
    >
      {/* Filter bar */}
      <div className="p-3 border-b flex flex-wrap gap-2 items-center shrink-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        {/* League badge */}
        <div className="flex items-center gap-1.5 mr-1">
          <NCAAIcon size={16} />
          <span className="text-xs font-semibold" style={{ color: NCAA_COLOR }}>NCAA</span>
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>D-I · 2025-26</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[140px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 300);
            }}
            placeholder="Search player..."
            className="w-full rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Position */}
        <select value={pos} onChange={e => setPos(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Position</option>
          {POSITIONS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {/* Archetype */}
        <select value={arch} onChange={e => setArch(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Archetype</option>
          {CORE.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="overall_score">Overall ↓</option>
          <option value="PTS">PTS ↓</option>
          <option value="REB">REB ↓</option>
          <option value="AST">AST ↓</option>
          <option value="GP">GP ↓</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="px-2 py-1.5 rounded text-xs"
            style={{ color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
            ✕ Clear
          </button>
        )}

        <span className="text-xs" style={{ color: "var(--text-faint)" }}>{total}</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : noData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <NCAAIcon size={40} />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>NCAA data not yet fetched</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Run <code className="px-1 rounded" style={{ background: "var(--bg-elevated)" }}>python src/fetch_ncaa.py</code> to load player data
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p, i) => (
              <PlayerCard
                key={i}
                player={{ ...p, overall_tier: p.overall_tier || "", league: "NCAA" }}
                rank={p.overall_score != null ? i + 1 : null}
                onClick={openPlayer}
              />
            ))}
          </div>
        )}
      </div>
    </SplitPane>
    </>
  );
}
