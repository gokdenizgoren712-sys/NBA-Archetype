import { gameClass } from "./sportTheme";
import "./sport-theme.css";
import "./setup.css";

// Liderlik kartı (mockup 3a / 11a). Veri çekmez; basketbol ve futbol sarmalayıcıları
// kendi uç noktalarını çağırıp satırları buraya verir.
//   rows: [{ key, rank, name, sub, score, me, top }]
export default function LeaderboardCard({
  sport = "basketball", bullet = false, tag, topScore, topName, topSub, reference, rows, loading, empty, error, onRetry, foot, children, className = "",
}) {
  return (
    <aside className={gameClass(sport, `sb-panel sb-lb ${className}`.trim())}>
      <div className="sb-lb-head">
        <span className="sb-card-title">{bullet ? "● " : ""}Leaderboard</span>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {topScore != null && (
        <div className="sb-lb-top">
          <span className="score">{topScore}</span>
          <div><div className="who">{topName}</div><div className="sub">{topSub}</div></div>
        </div>
      )}
      {reference && <div className="sb-lb-ref">{reference}</div>}
      {children}
      <div className="sb-lb-list">
        {loading && <p className="sb-lb-note" role="status">Loading…</p>}
        {error && (
          <p className="sb-lb-note" role="alert" style={{ color: "var(--sb-bad)" }}>
            {error} {onRetry && <button type="button" className="sb-chip-sm" onClick={onRetry}>Try again</button>}
          </p>
        )}
        {!loading && !error && rows?.length === 0 && <p className="sb-lb-note">{empty}</p>}
        {rows?.map((r) => (
          <div key={r.key} className={`sb-lb-row${r.me ? " me" : ""}${r.top ? " top" : ""}`}>
            <span className="rank">{r.rank}</span>
            <span className="name">{r.name}{r.me && <span className="you"> · you</span>}</span>
            <span className="w">{r.sub}</span>
            <span className="score">{r.score}</span>
          </div>
        ))}
      </div>
      {foot && <p className="sb-lb-foot">{foot}</p>}
    </aside>
  );
}
