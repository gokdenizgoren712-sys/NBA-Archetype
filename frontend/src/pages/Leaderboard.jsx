import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../lib/apiOrigin";
import { SEO } from "../hooks/useSEO";
import { Button, Tabs } from "../components/ui";
import "./leaderboard.css";

// /leaderboard (v3 B1, B1b): Basketball / Football, Classic / Salary Cap, en iyi skor kartı, ilk 25 tablo.
// Skor 100 üzerinden Lineup Fit (persantil DEĞİL). "Rank of N" için uç nokta alanı yok (ticket B9):
// "Your best": /api/leaderboard/me (B9); uç nokta yanıt vermezse ilk 25'teki satıra düşer.
const SPORTS = [["basketball", "Basketball"], ["football", "Football"]];
const MODES = [["classic", "Classic"], ["salarycap", "Salary cap"]];
const bandOf = (v) => (v >= 80 ? "var(--good)" : v >= 65 ? "#facc15" : v >= 50 ? "#fb923c" : "var(--danger)");
const PODIUM = ["#e5b84b", "#c0c4cc", "#c68a5b"];

const normalize = (sport, d) =>
  (d.entries || []).map((e, i) => sport === "basketball"
    ? { key: `${e.username}-${i}`, user: e.username, title: e.season_result || "—", wins: e.wins, score: e.pct, grade: e.grade }
    : { key: `${e.username}-${e.name}-${i}`, user: e.username, title: e.name, wins: null, shape: e.shape, score: e.percentile, grade: null });

export default function Leaderboard() {
  const { user, isLoggedIn, token } = useAuth();
  const [me, setMe] = useState(null);
  const [sport, setSport] = useState("basketball");
  const [mode, setMode] = useState("classic");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(false);
    const url = sport === "basketball" ? `/api/leaderboard?limit=25&mode=${mode}` : "/api/football/leaderboard?limit=25";
    fetch(apiUrl(url)).then((r) => { if (!r.ok) throw new Error("bad"); return r.json(); })
      .then((d) => { if (alive) setData({ rows: normalize(sport, d), total: d.total ?? d.reference_n ?? null }); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [sport, mode, tick]);

  useEffect(() => {
    if (!isLoggedIn) { setMe(null); return undefined; }
    let alive = true;
    const q = sport === "basketball" ? `sport=basketball&mode=${mode}` : "sport=football";
    fetch(apiUrl(`/api/leaderboard/me?${q}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setMe(d); }).catch(() => {});
    return () => { alive = false; };
  }, [sport, mode, isLoggedIn, token]);

  const rows = data?.rows;
  const top = rows?.[0];
  const mine = isLoggedIn && user?.username ? rows?.find((r) => r.user === user.username) : null;
  const playTo = sport === "basketball" ? "/basketball/game" : "/football/game";

  return (
    <div className="lb-page">
      <SEO title="Leaderboard" description="Top Lineup Fit scores from Primary Arch drafts." path="/leaderboard" />
      <header className="lb-head">
        <div>
          <p className="pa-eyebrow">Game · Leaderboard</p>
          <h1 className="pa-h1">Leaderboard</h1>
        </div>
        <Tabs label="Sport" segmented value={sport} onChange={setSport} items={SPORTS.map(([k, l]) => ({ key: k, label: l }))} />
      </header>

      {sport === "basketball" && (
        <div className="lb-modes" role="group" aria-label="Rule set">
          {MODES.map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}
        </div>
      )}

      <div className="lb-grid">
        <section className="lb-main">
          {top && (
            <div className="lb-best pa-panel">
              <span className="pa-eyebrow">Best on record</span>
              <div className="lb-best-row">
                <b style={{ color: "var(--accent)" }}>{top.score ?? "—"}</b>
                <div><strong>{top.user}</strong><span>{top.grade ? `Grade ${top.grade}` : top.title}{top.wins != null ? ` · ${top.wins} wins` : ""}</span></div>
              </div>
              <span className="lb-ref">{sport === "basketball" ? `Lineup Fit out of 100${data.total ? ` · best of ${data.total.toLocaleString("en-US")} runs` : ""}` : `Ranked against ${data.total ? data.total.toLocaleString("en-US") : "real"} real elevens`}</span>
            </div>
          )}

          <div className="lb-table pa-panel" role="table" aria-label="Top 25">
            <div className="lb-tr lb-th" role="row">
              <span>#</span><span>{sport === "basketball" ? "Player" : "Squad"}</span><span className="hide-s">{sport === "basketball" ? "Title" : "Shape"}</span><span className="hide-s r">Wins</span><span className="r">Fit</span><span className="r hide-s">Grade</span>
            </div>
            {!rows && !err && <p className="lb-note" role="status">Loading…</p>}
            {err && <p className="lb-note" role="alert">Could not load the leaderboard. <button type="button" className="lb-retry" onClick={() => setTick((t) => t + 1)}>Try again</button></p>}
            {rows?.length === 0 && <p className="lb-note">No runs on the board yet for this rule set. Draft nine, simulate the season, and the first score here is yours.</p>}
            {rows?.map((r, i) => (
              <div key={r.key} className={`lb-tr${r.user === user?.username && isLoggedIn ? " me" : ""}`} role="row">
                <span className="rk" style={i < 3 ? { color: PODIUM[i] } : undefined}>{i + 1}</span>
                <span className="nm">{sport === "basketball" ? r.user : r.title}{sport === "football" && <em>{r.user}</em>}</span>
                <span className="hide-s ttl">{sport === "basketball" ? r.title : r.shape}</span>
                <span className="hide-s r">{r.wins ?? "—"}</span>
                <b className="r" style={{ color: r.score != null ? bandOf(r.score) : undefined }}>{r.score ?? "—"}</b>
                <span className="hide-s r">{r.grade || "—"}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="lb-side">
          <div className="pa-panel lb-mine">
            <span className="pa-eyebrow">Your best</span>
            {me && me.rank != null ? (
              <div className="lb-best-row"><b style={{ color: bandOf(me.best_pct ?? me.percentile ?? 0) }}>{me.best_pct ?? me.percentile ?? "—"}</b>
                <div><strong>Rank {me.rank}{me.total ? ` of ${me.total.toLocaleString("en-US")}` : ""}</strong><span>{me.runs} run{me.runs === 1 ? "" : "s"} saved</span></div></div>
            ) : mine ? <div className="lb-best-row"><b style={{ color: bandOf(mine.score) }}>{mine.score}</b><div><strong>{mine.user}</strong><span>{mine.grade ? `Grade ${mine.grade}` : mine.title}</span></div></div>
              : <p className="lb-note">{isLoggedIn ? "No saved runs yet. Play one to land on the board." : "Sign in to land on the board."}</p>}
            <Button as={Link} to={playTo} variant="primary" size={48}>Play</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
