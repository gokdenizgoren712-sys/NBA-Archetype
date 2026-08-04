import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrophyIcon, CrownIcon, CapIcon, WheelIcon } from "./GameIcons";
import "./game.css";

// ── Canlı leaderboard — oyun giriş ekranının sağ sütunu ───────────────────
// Eskiden burada "How Scoring Works" duruyordu; skorlama artık giriş
// ekranındaki mod kartının ⓘ pop-up'ında anlatılıyor, o yüzden bu alan
// oyuncuya asıl gereken şeyi gösteriyor: şu an yenilmesi gereken skorlar.
//
// Seçili mod (classic / salarycap) değişince tablo da değişir — mod anahtarı
// hemen üstteki dock'ta, iki tablo tek ekranda karşılaştırılabiliyor.

const PODIUM = ["#FFB11B", "#cbd5e1", "#d08b52"];
const pctHex = (p) => p >= 85 ? "#60a5fa" : p >= 78 ? "#7dd3fc" : p >= 70 ? "#4ade80" : p >= 62 ? "#FFB11B" : "#f87171";

export default function LeaderboardPanel({ mode = "classic", limit = 25, fill = false }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState(null);   // null = yükleniyor

  useEffect(() => {
    let alive = true;
    setEntries(null);
    fetch(`/api/leaderboard?limit=${limit}&mode=${mode}`)
      .then(r => r.json())
      .then(d => { if (alive) setEntries(d.entries || []); })
      .catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, [mode, limit]);

  const top = entries?.[0];

  return (
    <div className={`g-panel p-4${fill ? " g-hud-fill" : ""}`}>
      <span className="aura-blob" style={{ "--slot-color": "#FFB11B", right: "10%", top: -40, width: 200, height: 110, opacity: 0.16 }} />

      <div className="g-label shrink-0 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--yamabuki)" }} />
          Leaderboard
        </span>
        <span className="g-status inline-flex items-center gap-1"
          style={mode === "salarycap"
            ? { "--accent": "#FFB11B", "--accent-a": "rgba(255,177,27,.12)", "--accent-line": "rgba(255,177,27,.4)" }
            : { "--accent": "#60a5fa", "--accent-a": "rgba(96,165,250,.12)", "--accent-line": "rgba(96,165,250,.4)" }}>
          {mode === "salarycap" ? <><CapIcon size={11} /> Salary Cap</> : <><WheelIcon size={11} /> Classic</>}
        </span>
      </div>

      {/* Lider — kovalanacak sayı, listeden önce ve büyük */}
      {top && (
        <div className="shrink-0 flex items-baseline gap-2.5 mt-3 mb-1">
          <span className="font-logo font-extrabold tabular-nums leading-none"
            style={{ fontSize: 40, color: pctHex(top.pct) }}>{top.pct}</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{top.username}</div>
            <div className="g-mono" style={{ color: "var(--text-faint)" }}>
              Grade {top.grade}{top.wins != null ? ` · ${top.wins}W` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Sıralama — kortun alt hattını aşarsa panel içinde kayar */}
      <div className={`mt-2.5 space-y-0.5${fill ? " flex-1 min-h-0 overflow-y-auto pr-0.5" : ""}`}>
        {entries === null && [...Array(7)].map((_, i) => <div key={i} className="g-lb-skel" />)}

        {entries?.length === 0 && (
          <p className="text-[11.5px] leading-relaxed py-3" style={{ color: "var(--text-muted)" }}>
            No runs on the board yet for this rule set. Draft nine, simulate the season, and the first score here is yours.
          </p>
        )}

        {entries?.map((e, i) => {
          const hex = PODIUM[i] || "#9ca3af";
          const isMe = user?.username && e.username === user.username;
          return (
            <div key={`${e.username}-${i}`}
              className={`g-lb-row${i < 3 ? " podium" : ""}${isMe ? " me" : ""}`}
              style={{ "--accent": hex, "--accent-a": hex + "1f", "--accent-line": hex + "55" }}>
              <span className="g-lb-rank">{i + 1}</span>
              <span className="g-lb-name">{e.username}</span>
              {e.season_result === "THREEPEAT" && (
                <span className="shrink-0" style={{ color: "var(--yamabuki)" }} title="Three straight simulated titles"><CrownIcon size={12} /></span>
              )}
              {e.season_result === "REPEAT" && (
                <span className="shrink-0 inline-flex" style={{ color: "var(--yamabuki)" }} title="Back-to-back simulated champion"><TrophyIcon size={11} /><TrophyIcon size={11} /></span>
              )}
              {e.season_result === "CHAMPION" && (
                <span className="shrink-0" style={{ color: "var(--yamabuki)" }} title="Won a simulated championship"><TrophyIcon size={11} /></span>
              )}
              {e.wins != null && <span className="g-lb-wins">{e.wins}W</span>}
              <span className="g-lb-pct" style={{ color: pctHex(e.pct) }}>{e.pct}</span>
              <span className="g-lb-grade">{e.grade}</span>
            </div>
          );
        })}
      </div>

      <p className="shrink-0 text-[10.5px] leading-relaxed pt-2.5 mt-2"
        style={{ color: "var(--text-faint)", borderTop: "1px solid rgba(255,255,255,.07)" }}>
        Scores are saved automatically once the season sim finishes — sign in to land on the board.
      </p>
    </div>
  );
}
