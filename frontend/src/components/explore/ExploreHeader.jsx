// Explore başlığı (handoff 8a/8b/11a): 40px "Explore" + alt çizgili sekmeler
// solda, sekmeye özgü kontroller (arama, sayı…) sağda. Sekmeler kendi URL'lerini
// korur (bookmark/SEO) — geçiş sadece navigate.
import { useNavigate } from "react-router-dom";
import "./explore.css";

export const EXPLORE_TABS = [
  { key: "map",      path: "/basketball/explore",  label: "Map" },
  { key: "compare",  path: "/basketball/compare",  label: "Compare" },
  { key: "affinity", path: "/basketball/affinity", label: "Affinity" },
];

export default function ExploreHeader({ active, aside, title = "Explore", tabs = EXPLORE_TABS, eyebrow }) {
  const sport = tabs[0]?.path?.startsWith("/football") ? "Football" : "Basketball";
  const label = tabs.find(t => t.key === active)?.label;
  const navigate = useNavigate();
  return (
    <header className="ex-head">
      <div className="ex-head-l">
        <div>
          <p className="pa-eyebrow">{eyebrow || `${sport} · ${title}${label ? ` · ${label}` : ""}`}</p>
          <h1>{title}</h1>
        </div>
        <nav className="ex-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.key} role="tab" aria-selected={active === t.key}
              className={active === t.key ? "on" : ""}
              onClick={() => active !== t.key && navigate(t.path)}>{t.label}</button>
          ))}
        </nav>
      </div>
      {aside && <div className="ex-head-r">{aside}</div>}
    </header>
  );
}
