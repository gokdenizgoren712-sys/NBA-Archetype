// Futbol liderlik tablosu — kaydedilmiş kadroların sıralaması.
//
// BASKETBOLDAN FARKI
// ──────────────────
// game/LeaderboardPanel.jsx lineup_games'ten okuyor: orada her oyun bir
// SİMÜLASYON SONUCU (galibiyet sayısı, sezon sonucu) üretiyor ve sıralama
// ona göre. Futbolda o tablo yok — kaydedilen şey kadronun kendisi, o yüzden
// sıralama saved_rosters üzerinden ve ölçüt kimya skoru.
//
// Gösterilen sayı HAM SKOR DEĞİL PERSANTİL. Ham 0-1 skorun kendi başına bir
// ölçeği yok; persantil "gerçekte sahaya çıkmış ilk-11'lerin yüzde kaçından
// iyi kurulmuş" demek (bkz. src/football/chem_reference.py).

import { useEffect, useState } from "react";
import { api } from "../../api";
import { ACCENT as ACC } from "./theme";

const SHAPES = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-2-1", "4-1-4-1", "5-3-2"];

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
const hex = (p) => (p >= 72 ? ACC : p >= 40 ? "#F2C14E" : "#E8654C");

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
    <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
      <span className="aura-blob" style={{ "--slot-color": ACC, left: "20%", top: -46,
        width: 260, height: 140, opacity: 0.14 }} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="g-mono" style={{ color: ACC }}>// Leaderboard</span>
        {data?.reference_n && (
          <span className="g-status" style={{ "--accent": "#9ca3af",
            "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
            ranked against {data.reference_n.toLocaleString("en-US")} real elevens
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={() => setShape("")} className="aura-pill-btn"
          style={!shape ? { borderColor: ACC, color: ACC } : undefined}>All shapes</button>
        {SHAPES.map((s) => (
          <button key={s} onClick={() => setShape(s)} className="aura-pill-btn"
            style={shape === s ? { borderColor: ACC, color: ACC } : undefined}>{s}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 14 }}>{err}</div>}
      {!err && !data && <div style={{ fontSize: 12.5, color: "var(--text-faint)",
        marginTop: 14 }}>Loading…</div>}

      {data && !data.entries.length && (
        <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
          Nothing here yet{shape ? ` for ${shape}` : ""}. Build an eighteen in Spin &amp; Build,
          then save it — saved squads land on this board.
        </div>
      )}

      {data?.entries?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14 }}>
          {data.entries.map((e, i) => {
            const p = e.percentile;
            return (
              <div key={`${e.username}-${e.name}-${i}`}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px",
                  borderRadius: 9, background: i === 0 ? `${ACC}12` : "rgba(255,255,255,.022)",
                  border: `1px solid ${i === 0 ? ACC + "44" : "var(--border)"}` }}>
                <span style={{ width: 22, textAlign: "right", fontVariantNumeric: "tabular-nums",
                  color: "var(--text-faint)", fontSize: 12 }}>{i + 1}</span>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-faint)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.username} · {e.shape}
                    {e.top_players?.length ? " · " + e.top_players.map(t => t.name).join(", ") : ""}
                  </div>
                </div>
                {p != null ? (
                  <div style={{ textAlign: "right", minWidth: 62 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: hex(p) }}>
                      {p}<span style={{ fontSize: 10 }}>{ordinal(p)}</span>
                    </div>
                    <div style={{ fontSize: 9, textTransform: "uppercase",
                      letterSpacing: ".07em", color: "var(--text-faint)" }}>pct</div>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>—</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
