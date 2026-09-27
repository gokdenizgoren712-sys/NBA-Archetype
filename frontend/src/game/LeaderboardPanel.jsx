import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrophyIcon, CrownIcon } from "./GameIcons";
import { apiUrl } from "../lib/apiOrigin";
import { SkeletonRows } from "../components/states/States";
import "./game.css";

// ── Canlı leaderboard (handoff 3a) ────────────────────────────────────────
// Kutusuz sütun: nabız atan nokta + başlık, kovalanacak en iyi skor büyük ve
// kendi renginde parlıyor, altında tablonun referansı, sonra 38px satırlar.
//
// Referans dürüst: bu sayı bir persantil DEĞİL, 100 üzerinden Lineup Fit
// puanı (draftScore.finalScore). Mock "persantil" diyordu; öyle yazmak yanlış
// bir iddia olurdu. Havuz büyüklüğü API'nin `total` alanından geliyor.

const PODIUM = ["#FFB11B", "#cbd5e1", "#d08b52"];
const pctHex = (p) => p >= 85 ? "#60a5fa" : p >= 78 ? "#7dd3fc" : p >= 70 ? "#4ade80" : p >= 62 ? "#FFB11B" : "#f87171";
const MODE = { classic: ["Classic", "#60a5fa"], salarycap: ["Salary Cap", "#FFB11B"] };

export default function LeaderboardPanel({ mode = "classic", limit = 25, fill = false }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);   // null = yükleniyor

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(apiUrl(`/api/leaderboard?limit=${limit}&mode=${mode}`))
      .then(r => r.json())
      .then(d => { if (alive) setData({ entries: d.entries || [], total: d.total }); })
      .catch(() => { if (alive) setData({ entries: [], total: null }); });
    return () => { alive = false; };
  }, [mode, limit]);

  const entries = data?.entries;
  const top = entries?.[0];
  const [modeLabel, modeHex] = MODE[mode] || MODE.classic;

  return (
    <div className={`g-lb${fill ? " fill" : ""}`}>
      <div className="g-lb-head">
        <span className="g-lb-pulse" />
        <span className="g-lb-title">Leaderboard</span>
        <span className="g-lb-mode" style={{ color: modeHex }}>{modeLabel}</span>
      </div>

      {top && (
        <div className="g-lb-top">
          <span className="g-lb-top-pct" style={{ "--c": pctHex(top.pct) }}>{top.pct}</span>
          <div className="min-w-0">
            <div className="g-lb-top-name">{top.username}</div>
            <div className="g-lb-top-sub">Grade {top.grade}{top.wins != null ? ` · ${top.wins} wins` : ""}</div>
          </div>
        </div>
      )}
      {data && (
        <div className="g-lb-ref">
          Lineup Fit score out of 100
          {data.total ? ` · best of ${data.total.toLocaleString()} ${modeLabel} runs on record` : ""}.
        </div>
      )}

      <div className="g-lb-list">
        {data === null && <SkeletonRows count={7} height={34} />}

        {entries?.length === 0 && (
          <p className="g-lb-empty">
            No runs on the board yet for this rule set. Draft nine, simulate the season, and the first score here is yours.
          </p>
        )}

        {entries?.map((e, i) => {
          const isMe = user?.username && e.username === user.username;
          const pod = PODIUM[i];
          return (
            <div key={`${e.username}-${i}`} className={`g-lb-row2${isMe ? " me" : ""}`}>
              <span className="rank" style={pod ? { "--p": pod } : undefined} data-podium={pod ? "" : undefined}>{i + 1}</span>
              <span className="name">{e.username}{isMe && <span className="you"> · you</span>}</span>
              {e.season_result === "THREEPEAT" && <span className="cup" title="Three straight simulated titles"><CrownIcon size={13} /></span>}
              {e.season_result === "REPEAT" && <span className="cup" title="Back-to-back simulated champion"><TrophyIcon size={12} /><TrophyIcon size={12} /></span>}
              {e.season_result === "CHAMPION" && <span className="cup" title="Won a simulated championship"><TrophyIcon size={12} /></span>}
              <span className="wins">{e.wins != null ? `${e.wins}W` : ""}</span>
              <span className="pct" style={{ color: pctHex(e.pct) }}>{e.pct}</span>
              <span className="grade">{e.grade}</span>
            </div>
          );
        })}
      </div>

      <p className="g-lb-foot">Scores are saved once the season sim finishes — sign in to land on the board.</p>
    </div>
  );
}
