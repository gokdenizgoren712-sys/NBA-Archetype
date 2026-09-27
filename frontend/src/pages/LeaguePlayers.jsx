import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import PlayerCard from "../components/PlayerCard";
import { SkeletonGrid, EmptyState, ErrorState } from "../components/states/States";
import {
  ListingPage, FilterGroup, UnderSelect, UnderSearch, PillSet, FacetList,
  ListingHero, LoadMore, CardGrid,
} from "../components/listing/Listing";
import { ARCHETYPE_COLOR, ARCHETYPE_BLURB, archetypeArt } from "../constants/archetypeColors";
import { TIER_COLOR, PROSPECT_TIERS } from "../constants/prospectTiers";

// G League / NCAA / EuroLeague listeleri (handoff 11c / 17b) — önceden üç
// neredeyse aynı dosyaydı (GLeague.jsx, NCAAPage.jsx, EuroLeaguePage.jsx);
// artık tek bileşen + lig yapılandırması, o üç dosya ince sarmalayıcı.
// Players (3b) kalıbı: filtre kolonu, arketip sayıları, "Load more"; lige
// özgü olan prospect şeridi (grade · tier · floor–ceiling) kartın altında.

const ALL_CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = [["", "All"], ["PG","PG"], ["SG","SG"], ["SF","SF"], ["PF","PF"], ["C","C"]];
const PAGE = 24;

export const LEAGUES = {
  gleague: {
    name: "G League", accent: "#e05070", glow: "#A8263F", cardLeague: "G-Lg",
    kicker: "Development league", title: "G League prospects", path: "/basketball/gleague",
    blurb: "Prospect grade and projected floor and ceiling for every G League player. Scores are percentiles within the league.",
    seo: "NBA G-League player archetype profiles — engine, anchor, spacer and more, scored within league context.",
    seasons: () => api.gleagueSeasons(), players: (p) => api.gleaguePlayers(p),
    group: { key: "teams", param: "team", label: "Team", any: "Any team" },
    // Initiator yok — optik takip verisi gelmiyor (bkz. score_compat.py LEAGUE_EXCLUDED_NOUNS)
    excluded: ["Initiator"], defaultSort: "prospect_grade", fetchCmd: "python src/fetch_gleague.py",
  },
  ncaa: {
    name: "NCAA", accent: "#3D7EC9", cardLeague: "NCAA",
    kicker: "NCAA Division I", title: "NCAA prospects", path: "/basketball/ncaa",
    blurb: "College players graded for the next draft: prospect grade, projected floor and ceiling, adjusted for strength of schedule.",
    seo: "NCAA Division I college basketball player archetype profiles — engine, anchor, spacer and more, scored within league context.",
    seasons: () => api.ncaaSeasons(), players: (p) => api.ncaaPlayers(p),
    group: { key: "conferences", param: "conference", label: "Conference", any: "Any conference" },
    excluded: ["Initiator"], defaultSort: "prospect_grade", fetchCmd: "python src/fetch_ncaa.py",
  },
  euroleague: {
    name: "EuroLeague", accent: "#FF6900", cardLeague: "EUR",
    kicker: "European club basketball", title: "EuroLeague players", path: "/basketball/euroleague",
    // Prospect notu yalnızca U21 oyunculara veriliyor (prospect.py max_age=20) —
    // bu yüzden varsayılan sıralama Overall, başlık "prospects" değil.
    blurb: "Archetype scores for every EuroLeague player. Prospect grades are given to under-21 players only.",
    seo: "EuroLeague player archetype profiles — engine, anchor, spacer and more, scored within league context.",
    seasons: () => api.euroleagueSeasons(), players: (p) => api.euroleaguePlayers(p),
    group: { key: "teams", param: "team", label: "Team", any: "Any team" },
    excluded: [], defaultSort: "overall_score", fetchCmd: "python src/fetch_euroleague.py",
  },
};

function ProspectStrip({ p, accent }) {
  if (p.prospect_grade == null) return null;
  const c = TIER_COLOR[p.prospect_tier] || accent;
  const floor = Math.max(0, Math.min(100, p.prospect_floor ?? 0));
  const ceil = Math.max(floor, Math.min(100, p.prospect_ceiling ?? floor));
  return (
    <div className="pa-prospect" style={{ "--c": c, "--lg": accent }}>
      <div className="top">
        <span className="grade">{Math.round(p.prospect_grade)}</span>
        <div className="tier">
          <b>{p.prospect_tier || "Prospect"}</b>
          <span>Prospect grade{p.AGE != null ? ` · age ${Math.round(p.AGE)}` : ""}</span>
        </div>
      </div>
      <div className="range"><span>Floor {Math.round(floor)}</span><span>Ceiling {Math.round(ceil)}</span></div>
      <div className="bar"><i style={{ left: `${floor}%`, right: `${100 - ceil}%` }} /></div>
    </div>
  );
}

export default function LeaguePlayers({ league }) {
  const L = LEAGUES[league];
  const core = ALL_CORE.filter(n => !L.excluded.includes(n));

  const [seasons, setSeasons] = useState(["2025-26"]);
  const [season, setSeason]   = useState("2025-26");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup]   = useState("");
  const [pos, setPos]       = useState("");
  const [arch, setArch]     = useState("");
  const [tier, setTier]     = useState("");
  const [minGp, setMinGp]   = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [sortBy, setSortBy] = useState(L.defaultSort);

  const [players, setPlayers] = useState([]);
  const [meta, setMeta]       = useState({ total: 0, pool: 0, arch_counts: {}, arch_total: 0, groups: [] });
  const [loading, setLoading] = useState(true);
  const [more, setMore]       = useState(false);
  const [error, setError]     = useState(false);
  const [noData, setNoData]   = useState(false);
  const debounceRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => {
    L.seasons().then(d => setSeasons(d.seasons?.length ? d.seasons : ["2025-26"])).catch(() => {});
  }, [L]);

  const fetchPage = useCallback((offset) => {
    const p = { season, limit: PAGE, offset, sort_by: sortBy };
    if (search) p.search = search;
    if (group)  p[L.group.param] = group;
    if (pos)    p.position = pos;
    if (arch)   p.arch = arch;
    if (tier)   p.tier = tier;
    if (minGp)  p.min_gp = minGp;
    if (maxAge) p.max_age = maxAge;
    return L.players(p);
  }, [L, season, search, group, pos, arch, tier, minGp, maxAge, sortBy]);

  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true); setError(false);
    try {
      const d = await fetchPage(0);
      if (id !== reqRef.current) return;
      if (d.coming_soon || (!d.total && d.message)) { setNoData(true); setPlayers([]); }
      else {
        setNoData(false);
        setPlayers(d.players || []);
        setMeta({ total: d.total || 0, pool: d.pool || 0, arch_counts: d.arch_counts || {},
                  arch_total: d.arch_total ?? d.total ?? 0, groups: d[L.group.key] || [] });
      }
    } catch {
      if (id === reqRef.current) setError(true);
    }
    if (id === reqRef.current) setLoading(false);
  }, [fetchPage, L]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    const id = reqRef.current;
    setMore(true);
    try {
      const d = await fetchPage(players.length);
      if (id === reqRef.current) setPlayers(prev => [...prev, ...(d.players || [])]);
    } catch { /* düğme tekrar denenebilir kalır */ }
    setMore(false);
  };

  const onSearch = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(v), 300);
  };
  const clearFilters = () => {
    setSearch(""); setSearchInput(""); setGroup(""); setPos(""); setArch(""); setTier(""); setMinGp(""); setMaxAge("");
  };
  const filterCount = [group, pos, arch, tier, minGp, maxAge].filter(Boolean).length;

  const tint = arch ? ARCHETYPE_COLOR[arch] : L.accent;
  const facets = core.map(n => ({ key: n, name: n, color: ARCHETYPE_COLOR[n], count: meta.arch_counts[n] || 0 }));

  const sortSelect = (
    <UnderSelect label="Sort" value={sortBy} onChange={setSortBy}
      options={[
        { value: "prospect_grade", label: "Prospect grade" }, { value: "overall_score", label: "Overall" },
        { value: "PTS", label: "Points" }, { value: "REB", label: "Rebounds" },
        { value: "AST", label: "Assists" }, { value: "GP", label: "Games" },
      ]} />
  );

  const secondary = (
    <>
      <FilterGroup label="Prospect tier">
        <UnderSelect label="Prospect tier" value={tier} onChange={setTier} options={PROSPECT_TIERS} placeholder="Any tier" />
      </FilterGroup>
      <FilterGroup label={L.group.label}>
        <UnderSelect label={L.group.label} value={group} onChange={setGroup} options={meta.groups} placeholder={L.group.any} />
      </FilterGroup>
      <FilterGroup label="Minimum games">
        <UnderSelect label="Minimum games" value={minGp} onChange={setMinGp}
          options={["10", "15", "20", "30"].map(v => ({ value: v, label: `${v}+ games` }))} placeholder="Any" />
      </FilterGroup>
      <FilterGroup label="Maximum age">
        <UnderSelect label="Maximum age" value={maxAge} onChange={setMaxAge}
          options={["20", "21", "22", "23", "25"].map(v => ({ value: v, label: `${v} or younger` }))} placeholder="Any age" />
      </FilterGroup>
    </>
  );

  const excludedNote = L.excluded.length > 0 && (
    <p className="pa-list-note">
      {L.excluded.join(", ")} isn't scored in the {L.name}: the league has no optical tracking data
      (speed, distance, pace) to build it from.
    </p>
  );

  const filters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={setSeason} options={seasons} />
      </FilterGroup>
      <UnderSearch value={searchInput} onChange={onSearch} />
      <FilterGroup label="Position">
        <PillSet value={pos} onChange={setPos} options={POSITIONS} />
      </FilterGroup>
      <FilterGroup label="Archetype">
        <FacetList items={facets} value={arch} onChange={setArch} allCount={meta.arch_total} />
        {excludedNote}
      </FilterGroup>
      {secondary}
    </>
  );
  const sheetFilters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={setSeason} options={seasons} />
      </FilterGroup>
      <FilterGroup label="Archetype">
        <FacetList chips items={facets} value={arch} onChange={setArch} />
        {excludedNote}
      </FilterGroup>
      <FilterGroup label="Position">
        <PillSet grid value={pos} onChange={setPos} options={POSITIONS.slice(1)} />
      </FilterGroup>
      {secondary}
      <FilterGroup label="Sort">{sortSelect}</FilterGroup>
    </>
  );

  const chips = [
    arch && { key: "arch", label: arch, color: ARCHETYPE_COLOR[arch], onClear: () => setArch("") },
    pos && { key: "pos", label: pos, onClear: () => setPos("") },
    tier && { key: "tier", label: tier, color: TIER_COLOR[tier], onClear: () => setTier("") },
    group && { key: "group", label: group, onClear: () => setGroup("") },
    minGp && { key: "gp", label: `${minGp}+ games`, onClear: () => setMinGp("") },
    maxAge && { key: "age", label: `Age ≤ ${maxAge}`, onClear: () => setMaxAge("") },
  ].filter(Boolean);

  return (
    <>
      <SEO title={L.name} description={L.seo} path={L.path} />
      <ListingPage
        tint={tint}
        glow={arch ? tint : (L.glow || L.accent)}
        filters={filters}
        sheetFilters={sheetFilters}
        filterCount={filterCount}
        onReset={clearFilters}
        chips={chips}
        resultLabel={loading ? "Show players" : `Show ${meta.total.toLocaleString("en-US")} players`}
        search={<UnderSearch filled value={searchInput} onChange={onSearch}
          placeholder={meta.pool ? `Search ${meta.pool.toLocaleString("en-US")} players` : "Search players"} />}
      >
        <ListingHero
          art={arch ? archetypeArt(arch) : null}
          eyebrow={arch ? `Archetype · ${meta.total} players` : `${L.kicker} · ${season}`}
          title={arch || L.title}
          blurb={arch ? ARCHETYPE_BLURB[arch] : L.blurb}
          aside={<><span className="pa-flabel">Sort</span>{sortSelect}</>}
        />

        {error ? (
          <ErrorState onRetry={load} />
        ) : loading ? (
          <SkeletonGrid count={6} height={380} />
        ) : noData ? (
          <EmptyState tint={L.accent} title={`No ${L.name} data for ${season}`}
            body={`This season hasn't been fetched yet. Run ${L.fetchCmd} --season ${season}, then clear the API cache.`} />
        ) : players.length === 0 ? (
          <EmptyState tint={tint} title="No players match"
            body={search ? `Nobody called "${search}" with these filters in ${season}.` : `No ${season} player fits all of these filters.`}
            actions={[{ label: "Clear filters", primary: true, onClick: clearFilters }]} />
        ) : (
          <>
            <CardGrid>
              {players.map((p, i) => (
                <div key={`${p.PLAYER_NAME}-${p.TEAM_ABBREVIATION || ""}-${i}`} className="pa-card-stack">
                  <PlayerCard
                    player={{ ...p, overall_tier: p.overall_tier || "", league: L.cardLeague }}
                    rank={p.overall_score != null && (sortBy === "overall_score" || sortBy === "prospect_grade") ? i + 1 : null}
                    season={season}
                    league={league}
                    expandable
                  />
                  <ProspectStrip p={p} accent={L.accent} />
                </div>
              ))}
            </CardGrid>
            <LoadMore shown={players.length} total={meta.total} onMore={loadMore} loading={more} />
          </>
        )}
      </ListingPage>
    </>
  );
}
