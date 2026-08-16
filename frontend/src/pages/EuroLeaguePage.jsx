import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import { EuroLeagueIcon } from "../components/LeagueIcons";
import PlayerCard from "../components/PlayerCard";
import AuraSearch from "../components/AuraSearch";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = ["","PG","SG","SF","PF","C"];
const EUR = "#FF6900";
const TIER_OPTIONS = ["Elite Prospect","First-Round","Rotation Upside","Developmental","Longshot"];

/* ── Main component ──────────────────────────────────────────────── */
export default function EuroLeaguePage() {
  const [seasons, setSeasons]         = useState(["2025-26"]);
  const [season, setSeason]           = useState("2025-26");
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [team, setTeam]               = useState("");
  const [pos, setPos]                 = useState("");
  const [arch, setArch]               = useState("");
  const [tier, setTier]               = useState("");
  const [minGp, setMinGp]             = useState("");
  const [maxAge, setMaxAge]           = useState("");
  const [sortBy, setSortBy]           = useState("overall_score");

  const [players, setPlayers] = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData]   = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.euroleagueSeasons().then(d => setSeasons(d.seasons?.length ? d.seasons : ["2025-26"])).catch(() => {});
  }, []);

  const teamList = useMemo(() =>
    [...new Set(players.map(p => p.TEAM_ABBREVIATION).filter(Boolean))].sort(),
    [players]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { season, limit: 80, sort_by: sortBy };
      if (search) params.search   = search;
      if (team)   params.team     = team;
      if (pos)    params.position = pos;
      if (arch)   params.arch     = arch;
      if (tier)   params.tier     = tier;
      if (minGp)  params.min_gp   = minGp;
      if (maxAge) params.max_age  = maxAge;
      const data = await api.euroleaguePlayers(params);
      if (data.coming_soon || (!data.total && data.message)) {
        setNoData(true); setPlayers([]); setTotal(0);
      } else {
        setNoData(false);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error(e);
      setNoData(true);
    }
    setLoading(false);
  }, [season, search, team, pos, arch, tier, minGp, maxAge, sortBy]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => { setSearch(""); setSearchInput(""); setTeam(""); setPos(""); setArch(""); setTier(""); setMinGp(""); setMaxAge(""); };
  const hasFilters = search || team || pos || arch || tier || minGp || maxAge;
  const secondaryCount = [team, pos, arch, tier, minGp, maxAge].filter(Boolean).length;

  const selectEl = (value, onChange, opts, placeholder, opt = {}) => (
    <div className="aura-select-wrap" style={opt.full ? { width: "100%" } : undefined}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`aura-select${opt.accent ? " accent" : ""}`} style={opt.full ? { width: "100%" } : undefined}>
        <option value="">{placeholder}</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const filterField = (label, node) => (
    <div>
      <div className="font-logo text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      {node}
    </div>
  );

  return (
    <>
    <SEO
      title="EuroLeague"
      description="EuroLeague player archetype profiles — engine, anchor, spacer and more, scored within league context."
      path="/basketball/euroleague"
    />
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* Slim filter bar — no box, just floating controls */}
      <div className="px-4 py-3 flex flex-wrap gap-1 items-center shrink-0">

        <div className="flex items-center gap-1.5 mr-1">
          <EuroLeagueIcon size={16} />
          <span className="text-xs font-semibold" style={{ color: EUR }}>EuroLeague</span>
        </div>

        <div className="aura-select-wrap">
          <select value={season} onChange={e => setSeason(e.target.value)} className="aura-select accent">
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <AuraSearch value={searchInput} placeholder="Search player..."
          onChange={v => {
            setSearchInput(v);
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setSearch(v), 300);
          }}
        />
        <div className="flex-1" />

        <button onClick={() => setFilterOpen(true)}
          className={`aura-pill-btn${secondaryCount > 0 ? " active" : ""}`}>
          <SlidersHorizontal size={13} />
          Filters
          {secondaryCount > 0 && <span className="aura-pill-badge">{secondaryCount}</span>}
        </button>

        <div className="aura-select-wrap">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="aura-select">
            <option value="overall_score">Overall ↓</option>
            <option value="PTS">PTS ↓</option>
            <option value="REB">REB ↓</option>
            <option value="AST">AST ↓</option>
            <option value="GP">GP ↓</option>
          </select>
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className="aura-pill-btn">✕ Clear</button>
        )}

        <span className="text-xs px-2" style={{ color: "var(--text-faint)" }}>{total}</span>
      </div>

      {/* Filter drawer */}
      {filterOpen && (
        <div className="absolute inset-0 z-40" style={{ background: "rgba(0,0,0,.55)" }}
          onClick={() => setFilterOpen(false)} />
      )}
      <div className={`aura-glass absolute top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col rounded-r-2xl transition-transform duration-300 ease-out
        ${filterOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ boxShadow: "18px 0 44px -16px rgba(0,0,0,.75)" }}>

        <div className="flex items-center justify-between px-4 py-3.5 shrink-0">
          <span className="font-logo text-sm font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Filters</span>
          <button onClick={() => setFilterOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {filterField("Team", selectEl(team, setTeam, teamList, "Any team", { full: true }))}
          {filterField("Position", selectEl(pos, setPos, POSITIONS.filter(Boolean), "Any position", { full: true }))}
          {filterField("Archetype", selectEl(arch, setArch, CORE, "Any archetype", { full: true }))}
          {filterField("Prospect Tier", selectEl(tier, setTier, TIER_OPTIONS, "Any tier", { full: true }))}
          {filterField("Min GP", (
            <input type="number" min="0" value={minGp} onChange={e => setMinGp(e.target.value)}
              placeholder="e.g. 15" className="aura-ghost-input w-full" />
          ))}
          {filterField("Max Age", (
            <input type="number" min="0" value={maxAge} onChange={e => setMaxAge(e.target.value)}
              placeholder="U21 gate is separate" className="aura-ghost-input w-full" />
          ))}
        </div>

        {secondaryCount > 0 && (
          <div className="px-4 pb-4 shrink-0">
            <button onClick={() => { setTeam(""); setPos(""); setArch(""); setTier(""); setMinGp(""); setMaxAge(""); }}
              className="aura-pill-btn active w-full justify-center">
              Clear {secondaryCount} filter{secondaryCount > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : noData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <EuroLeagueIcon size={40} />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>EuroLeague data not yet fetched</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Run <code className="px-1 rounded" style={{ background: "var(--bg-elevated)" }}>python src/fetch_euroleague.py</code> to load player data
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 justify-items-center items-start"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {players.map((p, i) => (
              <PlayerCard
                key={i}
                player={{ ...p, overall_tier: p.overall_tier || "", league: "EUR" }}
                rank={p.overall_score != null ? i + 1 : null}
                season={season}
                league="euroleague"
                expandable
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
