// Futbol liderlik tablosu — kaydedilmiş kadroların sıralaması (mockup 11a).
//
// BASKETBOLDAN FARKI
// ──────────────────
// game/LeaderboardPanel.jsx lineup_games'ten okuyor: orada her oyun bir
// SİMÜLASYON SONUCU üretiyor ve sıralama ona göre. Futbolda o tablo yok —
// kaydedilen şey kadronun kendisi, o yüzden sıralama saved_rosters üzerinden
// ve ölçüt kimya skoru.
//
// Gösterilen sayı HAM SKOR DEĞİL PERSANTİL. Persantil "gerçekte sahaya çıkmış
// ilk-11'lerin yüzde kaçından iyi kurulmuş" demek (src/football/chem_reference.py).

import { useEffect, useState } from "react";
import { api } from "../../api";
import LeaderboardCard from "../ui/LeaderboardCard";
import { SHAPE_KEYS } from "./formations";

export default function FootballLeaderboard({ limit = 25 }) {
  const [shape, setShape] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null); setErr(null);
    api.footballLeaderboard({ limit, ...(shape ? { shape } : {}) })
      .then(setData)
      .catch(() => setErr("Could not load the leaderboard."));
  }, [shape, limit]);

  return (
    <LeaderboardCard
      sport="football"
      bullet
      className="sb-shape-side"
      reference={data?.reference_n ? `RANKED AGAINST ${data.reference_n.toLocaleString("en-US")} REAL ELEVENS` : null}
      loading={!err && !data}
      empty={err || `Nothing here yet${shape ? ` for ${shape}` : ""}. Build an eighteen in Spin & Build, then save it — saved squads land on this board.`}
      rows={data?.entries?.map((e, i) => ({
        key: `${e.username}-${e.name}-${i}`, rank: i + 1, name: e.name,
        sub: e.shape, score: e.percentile != null ? e.percentile : "—", top: i < 3,
        me: false,
      }))}
    >
      <div className="sb-lb-filters">
        {["", ...SHAPE_KEYS].map((s) => (
          <button key={s || "all"} type="button" className="sb-chip-sm" aria-pressed={shape === s}
            onClick={() => setShape(s)}>{s || "All shapes"}</button>
        ))}
      </div>
    </LeaderboardCard>
  );
}
