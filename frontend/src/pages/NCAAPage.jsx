import { NCAAIcon } from "../components/LeagueIcons";
import { SEO } from "../hooks/useSEO";

export default function NCAAPage() {
  return (
    <>
      <SEO title="NCAA — NBA Archetype" description="NCAA college basketball player archetype profiles — coming soon." path="/ncaa" />
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="opacity-60">
          <NCAAIcon size={48} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>NCAA</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            College player archetype profiles — coming soon
          </p>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            League-internal percentile scoring · Current season only
          </p>
        </div>
        <span className="text-[10px] px-3 py-1 rounded-full"
          style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
          v3.2
        </span>
      </div>
    </>
  );
}
