import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import PlayerCard from "../components/PlayerCard";
import AuraSearch from "../components/AuraSearch";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = ["","PG","SG","SF","PF","C"];

/* ── Main component ──────────────────────────────────────────────── */
export default function Players() {
  const [seasons, setSeasons]   = useState([]);
  const [season, setSeason]     = useState("2025-26");

  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pos, setPos]               = useState("");
  const [arch, setArch]             = useState("");
  const [team, setTeam]             = useState("");
  const [tier, setTier]             = useState("");
  const [minGp, setMinGp]           = useState("");
  const [sortBy, setSortBy]         = useState("overall_score");

  const [players, setPlayers]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [teamList, setTeamList] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const debounceRef = useRef(null);

  const isCurrent = season === "2025-26";

  const histTeams = useMemo(() => {
    if (isCurrent) return [];
    return [...new Set(players.map(p => p.TEAM_ABBREVIATION).filter(Boolean))].sort();
  }, [players, isCurrent]);

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || [])).catch(() => {});
    api.teams().then(d => setTeamList(d.teams || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSearch(""); setSearchInput("");
    setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp("");
    setSortBy("overall_score");
    setPlayers([]); setTotal(0);
  }, [season]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isCurrent) {
        const params = { limit: 60, sort_by: sortBy };
        if (search) params.search = search;
        if (team)   params.team   = team;
        if (pos)    params.position = pos;
        if (arch)   params.arch   = arch;
        if (tier)   params.tier   = tier;
        if (minGp)  params.min_gp = minGp;
        const data = await api.players(params);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      } else {
        const params = { limit: 200, sort_col: sortBy, sort_asc: false };
        if (search) params.search = search;
        const data = await api.historical(season, params);
        let rows = data.players || [];
        if (pos)   rows = rows.filter(p => (p.POSITION || "") === pos);
        if (arch)  rows = rows.filter(p => (p.primary_arch || "") === arch);
        if (team)  rows = rows.filter(p => (p.TEAM_ABBREVIATION || "") === team);
        if (minGp) rows = rows.filter(p => Number(p.GP || 0) >= Number(minGp));
        setPlayers(rows);
        setTotal(data.total || rows.length);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [isCurrent, season, search, team, pos, arch, tier, minGp, sortBy]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => { setSearch(""); setSearchInput(""); setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp(""); };
  const hasFilters = search || pos || arch || team || tier || minGp;
  const secondaryCount = [pos, arch, team, tier, minGp].filter(Boolean).length;

  const toCardPlayer = (p) => ({ ...p, overall_tier: p.overall_tier || "" });

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
      title="NBA Players — Archetype Profiles"
      description="Browse every NBA player from 1983 to 2026 with their archetype classification, percentile scores, and modifier tags. Filter by position, archetype, or season."
      path="/players"
    />
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* Slim filter bar — no box, just floating controls */}
      <div className="px-4 py-3 flex flex-wrap gap-1 items-center shrink-0">

        <div className="aura-select-wrap">
          <select value={season} onChange={e => setSeason(e.target.value)} className="aura-select accent">
            <option value="2025-26">2025-26</option>
            {seasons.filter(s => s !== "2025-26").map(s => <option key={s} value={s}>{s}</option>)}
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
            {isCurrent && <option value="BPM">BPM ↓</option>}
            <option value="GP">GP ↓</option>
          </select>
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className="aura-pill-btn">✕ Clear</button>
        )}

        <span className="text-xs px-2" style={{ color: "var(--text-faint)" }}>{total}</span>
      </div>

      {/* Filter drawer — slides in from the sidebar edge */}
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
          {filterField("Position", selectEl(pos, setPos, POSITIONS.filter(Boolean), "Any position", { full: true }))}
          {filterField("Archetype", selectEl(arch, setArch, CORE, "Any archetype", { full: true }))}
          {filterField("Team", selectEl(team, setTeam, isCurrent ? teamList : histTeams, "Any team", { full: true }))}
          {isCurrent && filterField("Tier", selectEl(tier, setTier, ["Elite", "Star", "Starter", "Role Player"], "Any tier", { full: true }))}
          {filterField("Min GP", (
            <input type="number" min="0" value={minGp} onChange={e => setMinGp(e.target.value)}
              placeholder="e.g. 20" title="Minimum games played"
              className="aura-ghost-input w-full"
            />
          ))}
        </div>

        {secondaryCount > 0 && (
          <div className="px-4 pb-4 shrink-0">
            <button onClick={() => { setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp(""); }}
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
        ) : (
          <div className="grid gap-5 justify-items-center items-start"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {players.map((p, i) => (
              <PlayerCard
                key={i}
                player={toCardPlayer(p)}
                rank={p.overall_score != null ? i + 1 : null}
                season={!isCurrent ? season : undefined}
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
