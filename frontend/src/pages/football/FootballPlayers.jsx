import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballPlayerCard from "../../components/FootballPlayerCard";
import FootballFeedbackModal from "./FootballFeedbackModal";
import { SkeletonGrid, EmptyState, ErrorState } from "../../components/states/States";
import {
  ListingPage, FilterGroup, UnderSelect, UnderSearch, PillSet, FacetList,
  ListingHero, LoadMore, CardGrid,
} from "../../components/listing/Listing";
import { LEAGUE_LABEL } from "../../game/football/leagues";
import { ACCENT, PHASE_COLOR } from "../../game/football/theme";

// ── Futbol oyuncular sayfası (handoff 6a / mobil 19b kalıbı) ────────────────
// Önceden tek istekte 600 kart çekiliyordu; artık 24'lük sayfalar + "Load
// more". Faz listesi sayılarıyla solda (API phase_counts), faz seçilince sayfa
// o fazın rengine bürünür. Pozisyon filtresi yok (kullanıcı kararı — faz
// zaten pozisyon grubunu belirliyor); lig hapları kolonda.

const PAGE = 24;
const PHASES = [
  { key: "gk",  name: "Goalkeepers" },
  { key: "def", name: "Defenders" },
  { key: "mid", name: "Midfielders" },
  { key: "fwd", name: "Attackers" },
];
const PHASE_BLURB = {
  gk:  "Shot stopping, sweeping and distribution — each keeper scored against his own league's keepers.",
  def: "Centre-backs and full-backs split by what they actually produce: duels, progression, overlaps.",
  mid: "From deep-lying regista to box-to-box runner — nearby roles share a map.",
  fwd: "Finishers, inside forwards and creators, told apart by what they produce in the final third.",
};
const CONFIDENCE = [
  { value: "prototype", label: "Prototype" },
  { value: "clear", label: "Clear" },
  { value: "between roles", label: "Between roles" },
];

export default function FootballPlayers() {
  const [meta, setMeta]       = useState(null);
  const [season, setSeason]   = useState("");
  const [league, setLeague]   = useState("");
  const [phase, setPhase]     = useState("");
  const [arch, setArch]       = useState("");
  const [team, setTeam]       = useState("");
  const [conf, setConf]       = useState("");
  const [minMin, setMinMin]   = useState("");
  const [sortBy, setSortBy]   = useState("overall_score");
  const [search, setSearch]   = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [rows, setRows]       = useState([]);
  const [info, setInfo]       = useState({ total: 0, phase_counts: {}, phase_total: 0 });
  const [loading, setLoading] = useState(true);
  const [more, setMore]       = useState(false);
  const [error, setError]     = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const debounceRef = useRef();
  const reqRef = useRef(0);

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  const fetchPage = useCallback((offset) => {
    const p = { season, limit: PAGE, offset, sort: sortBy };
    if (league) p.league = league;
    if (phase) p.phase = phase;
    if (arch) p.archetype = arch;
    if (team) p.team = team;
    if (conf) p.confidence = conf;
    if (minMin) p.min_minutes = minMin;
    if (search) p.search = search;
    return api.footballPlayers(p);
  }, [season, league, phase, arch, team, conf, minMin, search, sortBy]);

  const load = useCallback(async () => {
    if (!season) return;
    const id = ++reqRef.current;
    setLoading(true); setError(false);
    try {
      const r = await fetchPage(0);
      if (id !== reqRef.current) return;
      setRows(r.players || []);
      setInfo({ total: r.total || 0, phase_counts: r.phase_counts || {}, phase_total: r.phase_total ?? r.total ?? 0 });
    } catch {
      if (id === reqRef.current) setError(true);
    }
    if (id === reqRef.current) setLoading(false);
  }, [season, fetchPage]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    const id = reqRef.current;
    setMore(true);
    try {
      const r = await fetchPage(rows.length);
      if (id === reqRef.current) setRows(prev => [...prev, ...(r.players || [])]);
    } catch { /* düğme tekrar denenebilir kalır */ }
    setMore(false);
  };

  const archOptions = useMemo(() => {
    if (!meta?.archetypes) return [];
    return phase ? (meta.archetypes[phase] || []) : Object.values(meta.archetypes).flat();
  }, [meta, phase]);
  const archCount = useMemo(() => Object.values(meta?.archetypes || {}).flat().length, [meta]);

  // Faz değişince o faza ait olmayan arketip seçimi düşer
  const pickPhase = (k) => {
    setPhase(k);
    if (arch && k && !(meta?.archetypes?.[k] || []).includes(arch)) setArch("");
  };

  const onSearch = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(v), 300);
  };
  const clearAll = () => {
    setLeague(""); setPhase(""); setArch(""); setTeam("");
    setConf(""); setMinMin(""); setSearch(""); setSearchInput("");
  };
  const filterCount = [league, phase, arch, team, conf, minMin].filter(Boolean).length;

  if (meta && !meta.available) {
    return (
      <EmptyState tint={ACCENT} title="No football data yet"
        body="No season has been built yet. Run the fetcher, then the score builder." />
    );
  }

  const tint = phase ? PHASE_COLOR[phase] : ACCENT;
  const phaseItems = PHASES.map(p => ({ ...p, color: PHASE_COLOR[p.key], count: info.phase_counts[p.key] || 0 }));
  const leagueOpts = [["", "All"], ...(meta?.leagues || []).map(l => [l, LEAGUE_LABEL[l] || l])];
  const leagueCount = meta?.leagues?.length || 0;

  const sortSelect = (
    <UnderSelect label="Sort" value={sortBy} onChange={setSortBy}
      options={[
        { value: "overall_score", label: "Overall" }, { value: "primary_score", label: "Archetype fit" },
        { value: "MINUTES_TOTAL", label: "Minutes" }, { value: "margin", label: "Role clarity" },
        { value: "PLAYER_NAME", label: "Name A–Z" },
      ]} />
  );

  const rest = (
    <>
      <FilterGroup label="League">
        <PillSet value={league} onChange={setLeague} options={leagueOpts} />
      </FilterGroup>
      <FilterGroup label="Archetype">
        <UnderSelect label="Archetype" value={arch} onChange={setArch} options={archOptions}
          placeholder={`Any of ${archOptions.length}`} />
      </FilterGroup>
      <FilterGroup label="Team">
        <UnderSelect label="Team" value={team} onChange={setTeam} options={meta?.teams || []} placeholder="Any team" />
      </FilterGroup>
      <FilterGroup label="Role clarity">
        <UnderSelect label="Role clarity" value={conf} onChange={setConf} options={CONFIDENCE} placeholder="Any" />
      </FilterGroup>
      <FilterGroup label="Minimum minutes">
        <UnderSelect label="Minimum minutes" value={minMin} onChange={setMinMin}
          options={[900, 1350, 1800, 2700].map(v => ({ value: String(v), label: `${v.toLocaleString("en-US")}+` }))}
          placeholder={meta?.min_minutes ? `${meta.min_minutes} (default)` : "Default"} />
      </FilterGroup>
      <button className="pa-btn-secondary" onClick={() => setFeedbackOpen(true)}>Suggest an archetype</button>
    </>
  );

  const seasonOpts = meta?.seasons || [];
  const filters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={setSeason} options={seasonOpts} />
      </FilterGroup>
      <UnderSearch value={searchInput} onChange={onSearch} />
      <FilterGroup label="Phase">
        <FacetList items={phaseItems} value={phase} onChange={pickPhase} allLabel="All phases" allCount={info.phase_total} />
      </FilterGroup>
      {rest}
    </>
  );
  const sheetFilters = (
    <>
      <FilterGroup label="Season">
        <UnderSelect big label="Season" value={season} onChange={setSeason} options={seasonOpts} />
      </FilterGroup>
      <FilterGroup label="Phase">
        <FacetList chips items={phaseItems} value={phase} onChange={pickPhase} allLabel="All phases" />
      </FilterGroup>
      {rest}
      <FilterGroup label="Sort">{sortSelect}</FilterGroup>
    </>
  );

  const chips = [
    phase && { key: "phase", label: PHASES.find(p => p.key === phase)?.name, color: PHASE_COLOR[phase], onClear: () => setPhase("") },
    league && { key: "league", label: LEAGUE_LABEL[league] || league, onClear: () => setLeague("") },
    arch && { key: "arch", label: arch, onClear: () => setArch("") },
    team && { key: "team", label: team, onClear: () => setTeam("") },
    conf && { key: "conf", label: CONFIDENCE.find(c => c.value === conf)?.label, onClear: () => setConf("") },
    minMin && { key: "min", label: `${minMin}+ min`, onClear: () => setMinMin("") },
  ].filter(Boolean);

  const phaseName = PHASES.find(p => p.key === phase)?.name;

  return (
    <>
      <SEO title="Football Players — Archetype Profiles"
        description="Every player in Europe's big leagues with their archetype, percentile fit and per-90 profile."
        path="/football/players" noindex />

      <ListingPage
        tint={tint}
        filters={filters}
        sheetFilters={sheetFilters}
        filterCount={filterCount}
        onReset={clearAll}
        chips={chips}
        resultLabel={loading ? "Show players" : `Show ${info.total.toLocaleString("en-US")} players`}
        search={<UnderSearch filled value={searchInput} onChange={onSearch} placeholder="Search players" />}
      >
        <ListingHero
          eyebrow={phase ? `Phase · ${info.total.toLocaleString("en-US")} players` : `${season}${leagueCount ? ` · ${leagueCount} leagues` : ""}`}
          title={phaseName || "Football players"}
          blurb={phase ? PHASE_BLURB[phase]
            : `${archCount || ""} archetypes across Europe's big ${leagueCount || "five"}. Every score is a percentile within the player's own league and phase.`.trim()}
          aside={<><span className="pa-flabel">Sort</span>{sortSelect}</>}
        />

        {error ? (
          <ErrorState onRetry={load} />
        ) : loading ? (
          <SkeletonGrid count={6} height={380} />
        ) : rows.length === 0 ? (
          <EmptyState tint={tint} title="No players match"
            body={search ? `Nobody called "${search}" with these filters in ${season}.` : `No ${season} player fits all of these filters.`}
            actions={[{ label: "Clear filters", primary: true, onClick: clearAll }]} />
        ) : (
          <>
            <CardGrid>
              {rows.map((p, i) => (
                <FootballPlayerCard
                  key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`}
                  player={p}
                  rank={(sortBy === "overall_score" || sortBy === "primary_score") ? i + 1 : null}
                  season={season}
                />
              ))}
            </CardGrid>
            <LoadMore shown={rows.length} total={info.total} onMore={loadMore} loading={more} />
          </>
        )}
      </ListingPage>

      {feedbackOpen && <FootballFeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
