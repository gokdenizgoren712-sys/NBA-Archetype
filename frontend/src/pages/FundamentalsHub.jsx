import { useLocation } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import GlossaryContent from "./Glossary";
import AboutContent from "./About";

const SEO_BY_PATH = {
  "/basketball/glossary": {
    key: "glossary", title: "Archetype Glossary",
    description: "Full glossary of NBA archetype components: 12 core roles and the modifier tags, explained with the metrics and thresholds used to classify every player.",
  },
  "/basketball/about": {
    key: "about", title: "About",
    description: "Learn how the Primary Arch system works: 12 core roles, modifier tags, percentile-based scoring across every season since 1983. Full changelog and methodology.",
  },
};

/* ── Glossary + About — tek nav girişi, iki kanonik URL ──────────────────
   Başlık + sekmeler (handoff 9b/17a) her içerikte ExploreHeader ile çiziliyor. */
export default function FundamentalsHub() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "");
  const active = SEO_BY_PATH[path] || SEO_BY_PATH["/basketball/glossary"];
  return (
    <div className="h-full min-h-0">
      <SEO title={active.title} description={active.description} path={path in SEO_BY_PATH ? path : "/basketball/glossary"} />
      {active.key === "glossary" ? <GlossaryContent /> : <AboutContent />}
    </div>
  );
}
