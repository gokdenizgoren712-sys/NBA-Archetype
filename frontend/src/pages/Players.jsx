import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import PlayerCard from "../components/PlayerCard";
import { SkeletonGrid, EmptyState, ErrorState } from "../components/states/States";
import {
  ListingPage, FilterGroup, UnderSelect, UnderSearch, PillSet, FacetList,
  ListingHero, LoadMore, CardGrid,
} from "../components/listing/Listing";
import { ARCHETYPE_COLOR, ARCHETYPE_BLURB, archetypeArt } from "../constants/archetypeColors";

// Handoff 3b / 19b. Filtreler artık sunucuda (tarihsel sezonlar dahil —
// önceden ilk 200 satıra istemcide uygulanıyordu, sayılar yanlıştı).
// Sayfalama offset'li "Load more"; arketip sayıları API'nin arch_counts'u.
const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = [["", "All"], ["PG","PG"], ["SG","SG"], ["SF","SF"], ["PF","PF"], ["C","C"]];
const TIERS = ["Elite", "Star", "Starter", "Role Player"];
const CURRENT = "2025-26";
const PAGE = 24;
const GOLD = "#FFB11B";

export default function Players() {
  // ?arch=Engine — Glossary'deki "Top players →" bu filtreyle açılır
  const [params] = useSearchParams();
  const initialArch = CORE.includes(params.get("arch")) ? params.get("arch") : "";
  const [seasons, setSeasons]   = useState([]);
  const [season, setSeason]     = useState(CURRENT);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pos, setPos]       = useState("");
  const [arch, setArch]     = useState(initialArch);
  const [team, setTeam]     = useState("");
  const [tier, setTier]     = useState("");
  const [minGp, setMinGp]   = useState("");
  const [sortBy, setSortBy] = useState("overall_score");

  const [players, setPlayers] = useState([]);
  const [meta, setMeta]       = useState({ total: 0, pool: 0, arch_counts: {}, arch_total: 0 });
  const [loading, setLoading] = useState(true);
  const [more, setMore]       = useState(false);
  const [error, setError]     = useState(false);
  const [teamList, setTeamList] = useState([]);
  const debounceRef = useRef(null);
  const reqRef = useRef(0);

  const isCurrent = season === CURRENT;

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || [])).catch(() => {});
    api.teams().then(d => setTeamList(d.teams || [])).catch(() => {});
  }, []);

  // Sezon değişince tarihsel takım listesi o sezonun takımlarından
  const [histTeams, setHistTeams] = useState([]);
  useEffect(() => {
    if (isCurrent) return;
    api.historical(season, { limit: 500 })
      .then(d => setHistTeams([...new Set((d.players || []).map(p => p.TEAM_ABBREVIATION).filter(Boolean))].sort()))
      .catch(() => setHistTeams([]));
  }, [season, isCurrent]);

  const changeSeason = (s) => {
    setSeason(s);
    setSearch(""); setSearchInput("");
    setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp("");
    setSortBy("overall_score");
  };

  const fetchPage = useCallback((offset) => {
    if (isCurrent) {
      const p = { limit: PAGE, offset, sort_by: sortBy };
      if (search) p.search = search;
      if (team)   p.team = team;
      if (pos)    p.position = pos;
      if (arch)   p.arch = arch;
      if (tier)   p.tier = tier;
      if (minGp)  p.min_gp = minGp;
      return api.players(p);
    }
    const p = { limit: PAGE, offset, sort_col: sortBy, sort_asc: false };
    if (search) p.search = search;
    if (team)   p.team = team;
    if (pos)    p.position = pos;
    if (arch)   p.arch = arch;
    if (minGp)  p.min_gp = minGp;
    return api.historical(season, p);
  }, [isCurrent, season, search, team, pos, arch, tier, minGp, sortBy]);

  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true); setError(false);
    try {
      const d = await fetchPage(0);
      if (id !== reqRef.current) return;
      setPlayers(d.players || []);
      setMeta({ total: d.total || 0, pool: d.pool || 0, arch_counts: d.arch_counts || {}, arch_total: d.arch_total ?? d.total ?? 0 });
    } catch {
      if (id === reqRef.current) setError(true);
    }
    if (id === reqRef.current) setLoading(false);
  }, [fetchPage]);

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
    setSearch(""); setSearchInput(""); setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp("");
  };
  const filterCount = [pos, arch, team, tier, minGp].filter(Boolean).length;

  const tint = arch ? ARCHETYPE_COLOR[arch] : GOLD;
  const facets = CORE.map(n => ({ key: n, name: n, color: ARCHETYPE_COLOR[n], count: meta.arch_counts[n] || 0 }));
  const teams = isCurrent ? teamList : histTeams;
  const seasonOpts = [CURRENT, ...seasons.filter(s => s !== CURRENT)];

  const sortSelect = (
    <UnderSelect label="Sort" value={sortBy} onChange={setSortBy}
      options={[
        { value: "overall_score", label: "Overall" }, { value: "PTS", label: "Points" },
        { value: "REB", label: "Rebounds" }, { value: "AST", label: "Assists" },
        ...(isCurrent ? [{ value: "BPM", label: "BPM" }] : []), { value: "GP", label: "Games" },
      ]} />
  );

  const secondary = (
    <>
      <FilterGroup label="Team">
        <UnderSelect label="Team" value={team} onChange={setTeam} options={teams} placeholder="Any team" />
      </FilterGroup>
      {isCurrent && (
        <FilterGroup label="Tier">
          <UnderSelect label="Tier" value={tier} onChange={setTier} options={TIERS} placeholder="Any tier" />
        </FilterGroup>
      )}
      <FilterGroup label="Minimum games">
        <UnderSelect label="Minimum games" value={minGp} onChange={setMinGp}
          options={["10", "20", "40", "60"].map(v => ({ value: v, label: `${v}+ games` }))} placeholder="Any" />
      </FilterGroup>
    </>
  );

  const filters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={changeSeason} options={seasonOpts} />
      </FilterGroup>
      <UnderSearch value={searchInput} onChange={onSearch} />
      <FilterGroup label="Position">
        <PillSet value={pos} onChange={setPos} options={POSITIONS} />
      </FilterGroup>
      <FilterGroup label="Archetype">
        <FacetList items={facets} value={arch} onChange={setArch} allCount={meta.arch_total} />
      </FilterGroup>
      {secondary}
    </>
  );

  const sheetFilters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={changeSeason} options={seasonOpts} />
      </FilterGroup>
      <FilterGroup label="Archetype">
        <FacetList chips items={facets} value={arch} onChange={setArch} />
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
    team && { key: "team", label: team, onClear: () => setTeam("") },
    tier && { key: "tier", label: tier, onClear: () => setTier("") },
    minGp && { key: "gp", label: `${minGp}+ games`, onClear: () => setMinGp("") },
  ].filter(Boolean);

  const blurb = arch
    ? ARCHETYPE_BLURB[arch]
    : meta.pool ? `Every archetype score is a percentile against the ${meta.pool.toLocaleString("en-US")} players in the ${season} pool.` : null;

  const cardPlayers = useMemo(() => players.map(p => ({ ...p, overall_tier: p.overall_tier || "" })), [players]);

  return (
    <>
      <SEO
        title="NBA Players — Archetype Profiles"
        description="Browse every NBA player from 1983 to 2026 with their archetype classification, percentile scores, and modifier tags. Filter by position, archetype, or season."
        path="/basketball/players"
      />
      <ListingPage
        tint={tint}
        filters={filters}
        sheetFilters={sheetFilters}
        filterCount={filterCount}
        onReset={clearFilters}
        chips={chips}
        summary={loading ? null : `Showing ${players.length.toLocaleString("en-US")} of ${meta.total.toLocaleString("en-US")}`}
        resultLabel={loading ? "Show players" : `Show ${meta.total.toLocaleString("en-US")} players`}
        search={<UnderSearch filled value={searchInput} onChange={onSearch}
          placeholder={meta.pool ? `Search ${meta.pool} players` : "Search players"} />}
      >
        <ListingHero
          art={arch ? archetypeArt(arch) : null}
          eyebrow={arch ? `Archetype · ${meta.total} players` : `${season} season`}
          title={arch || "NBA players"}
          blurb={blurb}
          aside={<><span className="pa-flabel">Sort</span>{sortSelect}</>}
        />

        {error ? (
          <ErrorState onRetry={load} />
        ) : loading ? (
          <SkeletonGrid count={6} height={380} label={`Loading ${season} players…`} />
        ) : players.length === 0 ? (
          <EmptyState tint={tint} title="No players match"
            body={search ? `Nobody called "${search}" with these filters in ${season}.` : `No ${season} player fits all of these filters.`}
            actions={[{ label: "Clear filters", primary: true, onClick: clearFilters }]} />
        ) : (
          <>
            <CardGrid>
              {cardPlayers.map((p, i) => (
                <PlayerCard
                  key={`${p.PLAYER_ID || p.PLAYER_NAME}-${i}`}
                  player={p}
                  rank={p.overall_score != null && sortBy === "overall_score" ? i + 1 : null}
                  season={!isCurrent ? season : undefined}
                  expandable
                  profileHref={`/basketball/players/${encodeURIComponent(p.PLAYER_NAME)}`}
                />
              ))}
            </CardGrid>
            <LoadMore shown={players.length} total={meta.total} onMore={loadMore} loading={more} />
          </>
        )}
      </ListingPage>
    </>
  );
}
