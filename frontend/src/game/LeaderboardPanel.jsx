import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../lib/apiOrigin";
import LeaderboardCard from "./ui/LeaderboardCard";

// ── Canlı leaderboard (mockup 3a) ──────────────────────────────────────────
// Kovalanacak en iyi skor büyük, altında tablonun referansı, sonra satırlar.
// Görünüm game/ui/LeaderboardCard.jsx'te; burası yalnız veriyi çekip eşliyor.
//
// Referans dürüst: bu sayı bir persantil DEĞİL, 100 üzerinden Lineup Fit
// puanı (draftScore.finalScore). Havuz büyüklüğü API'nin `total` alanından geliyor.

const MODE_LABEL = { classic: "CLASSIC", salarycap: "SALARY CAP" };
const RUN_LABEL = { classic: "Classic", salarycap: "Salary Cap" };

export default function LeaderboardPanel({ mode = "classic", limit = 25 }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);   // null = yükleniyor
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    fetch(apiUrl(`/api/leaderboard?limit=${limit}&mode=${mode}`))
      .then((r) => { if (!r.ok) throw new Error("bad"); return r.json(); })
      .then((d) => { if (alive) setData({ entries: d.entries || [], total: d.total }); })
      .catch(() => { if (alive) { setData({ entries: [], total: null }); setErr("Could not load the leaderboard."); } });
    return () => { alive = false; };
  }, [mode, limit, tick]);

  const entries = data?.entries;
  const top = entries?.[0];
  const reference = data
    ? `LINEUP FIT SCORE OUT OF 100${data.total ? ` · BEST OF ${data.total.toLocaleString()} ${(RUN_LABEL[mode] || "Classic").toUpperCase()} RUNS ON RECORD` : ""}`
    : null;

  return (
    <LeaderboardCard
      tag={MODE_LABEL[mode] || MODE_LABEL.classic}
      topScore={top?.pct}
      topName={top?.username}
      topSub={top ? `Grade ${top.grade}${top.wins != null ? ` · ${top.wins} wins` : ""}` : null}
      reference={reference}
      loading={data === null}
      error={err} onRetry={() => setTick((t) => t + 1)}
      empty="No runs on the board yet for this rule set. Draft nine, simulate the season, and the first score here is yours."
      rows={entries?.map((e, i) => ({
        key: `${e.username}-${i}`, rank: i + 1, name: e.username,
        sub: e.wins != null ? `${e.wins}W` : "", score: e.pct, top: i < 3,
        me: Boolean(user?.username && e.username === user.username),
      }))}
      foot="Scores are saved once the season sim finishes — sign in to land on the board."
    />
  );
}
