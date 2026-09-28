import { useLocation } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import ExploreContent from "./Explore";
import CompareContent from "./Compare";
import AffinityContent from "./Affinity";

const SEO_BY_TAB = {
  "/basketball/explore": {
    key: "map", title: "Explore Archetypes",
    description: "Explore all NBA player archetypes with projections, percentile scores, and role breakdowns. Filter by position, archetype, and modifier tags across 40+ seasons.",
  },
  "/basketball/compare": {
    key: "compare", title: "Compare NBA Players",
    description: "Compare any two NBA players side by side across any season from 1983 to today. Radar profiles, archetype tags, BPM, and 12 role scores for every player-season.",
  },
  "/basketball/affinity": {
    key: "affinity", title: "Archetype Affinity Network",
    description: "Discover which NBA archetypes work best together. Explore an interactive affinity network across all 12 player roles, with real lineup drill-downs showing net rating data.",
  },
};

/* ── Explore / Compare / Affinity ────────────────────────────────────────
   Tek nav girişi, üç araç. Her biri kendi kanonik URL'sini korur; başlık +
   sekmeler (handoff 8a) her sekmenin içinde ExploreHeader ile çiziliyor,
   çünkü sağ taraftaki kontroller sekmeye özgü. */
export default function ExploreHub() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "");
  const active = SEO_BY_TAB[path] || SEO_BY_TAB["/basketball/explore"];

  return (
    <div className="h-full min-h-0">
      <SEO title={active.title} description={active.description} path={path in SEO_BY_TAB ? path : "/basketball/explore"} />
      {active.key === "map" && <ExploreContent />}
      {active.key === "compare" && <CompareContent />}
      {active.key === "affinity" && <AffinityContent />}
    </div>
  );
}
