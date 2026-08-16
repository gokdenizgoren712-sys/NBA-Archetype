import { useLocation, useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import ExploreContent from "./Explore";
import CompareContent from "./Compare";
import AffinityContent from "./Affinity";

const TABS = [
  {
    key: "map", path: "/basketball/explore", label: "Map",
    seo: {
      title: "Explore Archetypes",
      description: "Explore all NBA player archetypes with projections, percentile scores, and role breakdowns. Filter by position, archetype, and modifier tags across 40+ seasons.",
    },
  },
  {
    key: "compare", path: "/basketball/compare", label: "Compare",
    seo: {
      title: "Compare NBA Players",
      description: "Compare any two NBA players side by side across any season from 1983 to today. Radar profiles, archetype tags, BPM, and 12 role scores for every player-season.",
    },
  },
  {
    key: "affinity", path: "/basketball/affinity", label: "Affinity",
    seo: {
      title: "Archetype Affinity Network",
      description: "Discover which NBA archetypes work best together. Explore an interactive affinity network across all 12 player roles, with real lineup drill-downs showing net rating data.",
    },
  },
];

/* ── Unified Explore / Compare / Affinity hub ────────────────────────
   Three tools that share one pattern — pick or browse players, inspect
   a relationship between them — now live under one shell with one nav
   entry. Each keeps its own canonical URL (bookmarks/SEO stay intact);
   switching tabs just navigates between them. */
export default function ExploreHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = TABS.find(t => t.path === location.pathname) || TABS[0];

  return (
    <div className="h-full flex flex-col min-h-0">
      <SEO title={active.seo.title} description={active.seo.description} path={active.path} />

      <div className="flex items-center gap-1 px-4 pt-3 pb-1 shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => navigate(t.path)}
            className={`aura-pill-btn${active.key === t.key ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {active.key === "map" && <ExploreContent />}
        {active.key === "compare" && <CompareContent />}
        {active.key === "affinity" && <AffinityContent />}
      </div>
    </div>
  );
}
