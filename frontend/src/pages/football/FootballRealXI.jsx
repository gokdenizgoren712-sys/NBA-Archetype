import { useState, useEffect } from "react";
import { api } from "../../api";
import { ACCENT } from "../../game/football/theme";

// ── Real XI ──────────────────────────────────────────────────────────────────
// Basketboldaki "Real lineups" sekmesinin karşılığı ama daha zengin: orada
// beşli + net rating var, burada GERÇEK BİR MAÇIN kadrosu ve o maçın sonucu.
// Kaynak cache'teki 3100+ maçın ilk 11'i (src/football/real_xi.py).
//
// Sayfanın asıl işi doğrulama. Üstteki dört sayı motorun kendi kendini
// sınadığı yer ve üçüncüsü belirleyici: KALİTE SABİT TUTULDUĞUNDA kimyanın
// sonuçla ilişkisi. Ham korelasyon yanıltıcı çünkü yüksek kimyalı XI'ler
// zaten yüksek kaliteli oluyor.
//
// Tek satır bir şey KANITLAMAZ — bir maçın sonucu gürültüdür. Anlamlı olan
// toplu eğilim; sayfa da öyle sunuyor.

export default function FootballRealXI({ season }) {
  const [data, setData] = useState(null);
  const [sort, setSort] = useState("chemistry");
  const [result, setResult] = useState("");
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.footballRealXI({ season, sort, limit: 60, ...(result ? { result } : {}) })
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [season, sort, result]);

  const v = data?.validation;
  const cards = v ? [
    ["Chemistry → goal diff", v.chemistry_raw],
    ["Quality → goal diff", v.quality_raw],
    ["Chemistry, quality held constant", v.chemistry_partial],
    ["Chemistry ↔ quality overlap", v.chemistry_quality_overlap],
  ] : [];

  return (
    <div className="space-y-3">
      {v && (
        <div className="g-panel p-4">
          <div className="g-label mb-2">
            Does chemistry predict results?
          </div>
          <div className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
            {cards.map(([l, x], i) => (
              <div key={l}>
                <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{l}</div>
                <div className="text-lg font-bold" style={{
                  color: i === 2
                    ? (Math.abs(x) >= 0.15 ? ACCENT : "#E8654C")
                    : "var(--text-primary)",
                }}>
                  {x > 0 ? "+" : ""}{Number(x).toFixed(3)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            Across {v.n?.toLocaleString()} real XIs. The third number is the one
            that counts: with squad quality held constant, chemistry currently
            explains almost nothing. The raw figure looks better only because
            high-chemistry XIs tend to be high-quality XIs — that overlap is the
            fourth number.
          </div>
        </div>
      )}

      <div className="g-panel p-3 flex flex-wrap gap-2 items-center">
        <div className="aura-select-wrap">
          <select value={sort} onChange={e => setSort(e.target.value)} className="aura-select">
            <option value="chemistry">Chemistry ↓</option>
            <option value="goal_diff">Goal difference ↓</option>
            <option value="avg_quality">Quality ↓</option>
          </select>
        </div>
        {[["", "All"], ["W", "Won"], ["D", "Drew"], ["L", "Lost"]].map(([r, l]) => (
          <button key={r || "all"} onClick={() => setResult(r)}
            className={`aura-pill-btn${result === r ? " active" : ""}`}>{l}</button>
        ))}
        <span className="text-[11px] ml-auto" style={{ color: "var(--text-faint)" }}>
          {data?.total?.toLocaleString() || 0} XIs
        </span>
      </div>

      <div className="g-panel p-3 space-y-1">
        {loading ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
            Loading…
          </div>
        ) : !data?.lineups?.length ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
            {data?.message || "No real XIs for this season yet."}
          </div>
        ) : data.lineups.map((l, i) => {
          const isOpen = open === i;
          let players = [], archs = [];
          try { players = JSON.parse(l.players || "[]"); } catch { /* boş bırak */ }
          try { archs = JSON.parse(l.archetypes || "[]"); } catch { /* boş bırak */ }
          return (
            <div key={`${l.match_id}-${l.team}`}>
              <button onClick={() => setOpen(isOpen ? null : i)}
                className="g-rr w-full"
                style={{ "--accent": "#3FB08C", "--accent-a": "#3FB08C1f", "--accent-line": "#3FB08C4d" }}>
                <b className="text-[13px] tabular-nums"
                  style={{ color: ACCENT, minWidth: 30 }}>
                  {Math.round(l.chemistry * 100)}
                </b>
                <span className="text-[12px] text-white truncate" style={{ flex: 1 }}>
                  {l.team}
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  {l.formation}
                </span>
                <span className="text-[11.5px] tabular-nums" style={{
                  color: l.result === "W" ? ACCENT
                    : l.result === "L" ? "#E8654C" : "var(--text-muted)",
                  minWidth: 48, textAlign: "right",
                }}>
                  {l.goals_for}–{l.goals_against}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <div className="grid gap-x-3 gap-y-0.5"
                    style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
                    {players.map((n, j) => (
                      <div key={j} className="truncate">
                        {n}
                        <span style={{ color: "var(--text-faint)" }}> · {archs[j]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5" style={{ color: "var(--text-faint)" }}>
                    Strongest {l.strongest} · Weakest {l.weakest} ·
                    quality {Math.round(l.avg_quality * 100)} ·
                    {" "}{l.known_players} players matched
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
