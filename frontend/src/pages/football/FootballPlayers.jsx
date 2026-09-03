import { useState, useEffect, useMemo, useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import AuraSearch from "../../components/AuraSearch";
import FootballPlayerCard from "../../components/FootballPlayerCard";
import FootballFeedbackModal from "./FootballFeedbackModal";
import { LEAGUE_LABEL } from "../../game/football/leagues";
import { ACCENT } from "../../game/football/theme";

// ── Futbol oyuncular sayfası ─────────────────────────────────────────────────
// Düzen NBA Players sayfasıyla aynı prensipte: ince üst bar + soldan açılan
// filtre çekmecesi + kart ızgarası. Kullanıcı kararı: üst barda yalnızca FAZ
// filtresi kalır (pozisyon filtresi kaldırıldı — faz zaten pozisyon grubunu
// belirliyor), diğer bütün filtreler çekmecede.

const PHASES = [
  { key: "", label: "All phases" },
  { key: "gk", label: "Goalkeeper" },
  { key: "def", label: "Defence" },
  { key: "mid", label: "Midfield" },
  { key: "fwd", label: "Attack" },
];

// Veri lig anahtarını slug olarak tutuyor (fetch_fotmob.LEAGUES); ekranda
// okunur adı gösteriyoruz. Bilinmeyen slug olduğu gibi basılır.
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
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const debounceRef = useRef();

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  useEffect(() => {
    if (!season) return;
    setLoading(true);
    const p = { season, limit: 600, sort: sortBy };
    if (league) p.league = league;
    if (phase) p.phase = phase;
    if (arch) p.archetype = arch;
    if (team) p.team = team;
    if (conf) p.confidence = conf;
    if (minMin) p.min_minutes = minMin;
    if (search) p.search = search;
    api.footballPlayers(p)
      .then(r => setRows(r.players || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [season, league, phase, arch, team, conf, minMin, search, sortBy]);

  const archOptions = useMemo(() => {
    if (!meta?.archetypes) return [];
    return phase ? (meta.archetypes[phase] || [])
                 : Object.values(meta.archetypes).flat();
  }, [meta, phase]);

  // Rozet yalnızca ÇEKMECEDEKİ filtreleri sayar; lig ve faz üst barda
  // görünür durumda olduğu için sayılmaz.
  const secondaryCount = [arch, team, conf, minMin].filter(Boolean).length;
  const hasFilters = secondaryCount > 0 || search || league || phase;
  const clearAll = () => {
    setLeague(""); setPhase(""); setArch(""); setTeam("");
    setConf(""); setMinMin(""); setSearch(""); setSearchInput("");
  };

  const selectEl = (val, set, opts, placeholder) => (
    <div className="aura-select-wrap" style={{ width: "100%" }}>
      <select value={val} onChange={e => set(e.target.value)} className="aura-select">
        <option value="">{placeholder}</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const field = (label, node) => (
    <div>
      <div className="font-logo text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: "var(--text-faint)" }}>{label}</div>
      {node}
    </div>
  );

  if (meta && !meta.available) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="font-logo text-xl font-bold text-white mb-2">Football players</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No season data has been built yet. Run the fetcher, then the score builder.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO title="Football Players — Archetype Profiles"
        description="Every player in Europe's big leagues with their archetype, percentile fit and per-90 profile."
        path="/football/players" noindex />

      <div className="relative flex flex-col h-full min-h-0 overflow-hidden">

        {/* Üst bar — sezon, arama, faz, pozisyon, sıralama */}
        <div className="px-4 py-3 flex flex-wrap gap-1 items-center shrink-0">
          <div className="aura-select-wrap">
            <select value={season} onChange={e => setSeason(e.target.value)}
              className="aura-select accent">
              {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <AuraSearch value={searchInput} placeholder="Search player..."
            onChange={v => {
              setSearchInput(v);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(v), 300);
            }} />

          <div className="aura-select-wrap">
            <select value={phase} onChange={e => setPhase(e.target.value)} className="aura-select">
              {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          {/* Lig — açılır kutu değil, her lig kendi düğmesi (kullanıcı kararı).
              Aynı lige tekrar basmak seçimi kaldırır, yani "hepsi" ayrı bir
              düğme istemiyor. */}
          <div className="flex gap-1 items-center">
            {(meta?.leagues || []).map(l => (
              <button key={l}
                onClick={() => setLeague(league === l ? "" : l)}
                className={`aura-pill-btn${league === l ? " active" : ""}`}
                title={league === l ? "Show all leagues" : `Only ${LEAGUE_LABEL[l] || l}`}>
                {LEAGUE_LABEL[l] || l}
              </button>
            ))}
          </div>

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
              <option value="primary_score">Archetype fit ↓</option>
              <option value="MINUTES_TOTAL">Minutes ↓</option>
              <option value="margin">Role clarity ↓</option>
              <option value="PLAYER_NAME">Name A–Z</option>
            </select>
          </div>

          {hasFilters && <button onClick={clearAll} className="aura-pill-btn">✕ Clear</button>}
          <span className="text-xs px-2" style={{ color: "var(--text-faint)" }}>{rows.length}</span>
        </div>

        {/* Filtre çekmecesi */}
        {filterOpen && (
          <div className="absolute inset-0 z-40" style={{ background: "rgba(0,0,0,.55)" }}
            onClick={() => setFilterOpen(false)} />
        )}
        <div className={`aura-glass absolute top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col rounded-r-2xl transition-transform duration-300 ease-out
          ${filterOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ boxShadow: "18px 0 44px -16px rgba(0,0,0,.75)" }}>
          <div className="flex items-center justify-between px-4 py-3.5 shrink-0">
            <span className="font-logo text-sm font-bold uppercase tracking-wider"
              style={{ color: ACCENT }}>Filters</span>
            <button onClick={() => setFilterOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ color: "var(--text-muted)" }}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            {/* Lig burada YOK — üst barda düğme olarak duruyor */}
            {field("Archetype", selectEl(arch, setArch, archOptions, "Any archetype"))}
            {field("Team", selectEl(team, setTeam, meta?.teams || [], "Any team"))}
            {field("Role clarity", selectEl(conf, setConf,
              ["prototype", "clear", "between roles"], "Any"))}
            {field("Min minutes", (
              <input type="number" min="0" step="90" value={minMin}
                onChange={e => setMinMin(e.target.value)}
                placeholder={meta?.min_minutes ? `default ${meta.min_minutes}` : "e.g. 900"}
                className="aura-ghost-input w-full" />
            ))}
            <button onClick={() => setFeedbackOpen(true)}
              className="aura-pill-btn w-full justify-center">
              Suggest an archetype
            </button>
          </div>
          {secondaryCount > 0 && (
            <div className="px-4 pb-4 shrink-0">
              <button onClick={() => {
                setArch(""); setTeam(""); setConf(""); setMinMin("");
              }} className="aura-pill-btn active w-full justify-center">
                Clear {secondaryCount} filter{secondaryCount > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>

        {/* Izgara */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </div>
          ) : !rows.length ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
              No players match these filters.
            </div>
          ) : (
            <div className="grid gap-5 justify-items-center items-start"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {rows.map((p, i) => (
                <FootballPlayerCard
                  key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`}
                  player={p}
                  rank={(sortBy === "overall_score" || sortBy === "primary_score") ? i + 1 : null}
                  season={season}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {feedbackOpen && <FootballFeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
