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

  const selectEl = (value, onChange, opts, placeholder) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded px-3 py-1.5 text-sm focus:outline-none"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
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
      {/* Slim filter bar */}
      <div className="px-3 py-2.5 border-b flex flex-wrap gap-2 items-center shrink-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        {/* Season */}
        <select value={season} onChange={e => setSeason(e.target.value)}
          className="rounded px-3 py-1.5 text-sm font-medium focus:outline-none"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
          <option value="2025-26">2025-26</option>
          {seasons.filter(s => s !== "2025-26").map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Search */}
        <AuraSearch value={searchInput} placeholder="Search player..."
          onChange={v => {
            setSearchInput(v);
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setSearch(v), 300);
          }}
        />
        <div className="flex-1" />

        {/* Filters button — opens the drawer */}
        <button onClick={() => setFilterOpen(true)}
          className="relative flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            background: secondaryCount > 0 ? "var(--accent-dim)" : "var(--bg-elevated)",
            border: `1px solid ${secondaryCount > 0 ? "var(--accent-border)" : "var(--border)"}`,
            color: secondaryCount > 0 ? "var(--accent)" : "var(--text-primary)",
          }}>
          <SlidersHorizontal size={13} />
          Filters
          {secondaryCount > 0 && (
            <span className="flex items-center justify-center rounded-full font-logo font-bold"
              style={{ width: 16, height: 16, fontSize: 10, background: "var(--accent)", color: "#14110a" }}>
              {secondaryCount}
            </span>
          )}
        </button>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="overall_score">Overall ↓</option>
          <option value="PTS">PTS ↓</option>
          <option value="REB">REB ↓</option>
          <option value="AST">AST ↓</option>
          {isCurrent && <option value="BPM">BPM ↓</option>}
          <option value="GP">GP ↓</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="px-2 py-1.5 rounded text-xs transition-colors"
            style={{ color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
            ✕ Clear
          </button>
        )}

        <span className="text-xs" style={{ color: "var(--text-faint)" }}>{total}</span>
      </div>

      {/* Filter drawer — slides in from the sidebar edge */}
      {filterOpen && (
        <div className="absolute inset-0 z-40" style={{ background: "rgba(0,0,0,.55)" }}
          onClick={() => setFilterOpen(false)} />
      )}
      <div className={`absolute top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col transition-transform duration-300 ease-out
        ${filterOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--accent-border)", boxShadow: "12px 0 32px -12px rgba(0,0,0,.7)" }}>

        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="font-logo text-sm font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Filters</span>
          <button onClick={() => setFilterOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filterField("Position", selectEl(pos, setPos, POSITIONS.filter(Boolean), "Any position"))}
          {filterField("Archetype", selectEl(arch, setArch, CORE, "Any archetype"))}
          {filterField("Team", selectEl(team, setTeam, isCurrent ? teamList : histTeams, "Any team"))}
          {isCurrent && filterField("Tier", selectEl(tier, setTier, ["Elite", "Star", "Starter", "Role Player"], "Any tier"))}
          {filterField("Min GP", (
            <input type="number" min="0" value={minGp} onChange={e => setMinGp(e.target.value)}
              placeholder="e.g. 20" title="Minimum games played"
              className="w-full rounded px-3 py-1.5 text-sm focus:outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          ))}
        </div>

        {secondaryCount > 0 && (
          <div className="p-4 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => { setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp(""); }}
              className="w-full rounded px-3 py-2 text-xs font-medium transition-colors"
              style={{ color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
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
