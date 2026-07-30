import { useLocation, useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import GlossaryContent from "./Glossary";
import AboutContent from "./About";

const TABS = [
  {
    key: "glossary", path: "/glossary", label: "Glossary",
    seo: {
      title: "Archetype Glossary",
      description: "Full glossary of NBA archetype components: 12 core roles and 22 modifier tags explained with the metrics and thresholds used to classify every player.",
    },
  },
  {
    key: "about", path: "/about", label: "About",
    seo: {
      title: "About",
      description: "Learn how the Primary Arch system works: 12 core roles, 22 modifier tags, percentile-based scoring across every season since 1983. Full changelog and methodology.",
    },
  },
];

/* ── Glossary + About — the site's fundamentals, one shell ──────────
   Same consolidation pattern as ExploreHub: both keep their canonical
   URL, switching tabs just navigates between them. */
export default function FundamentalsHub() {
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
        {active.key === "glossary" && <GlossaryContent />}
        {active.key === "about" && <AboutContent />}
      </div>
    </div>
  );
}
