import { useState, useEffect, useRef } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import PlayerSearch from "../../game/football/PlayerSearch";
import "../../game/game.css";
import { ACCENT, PHASE_COLOR } from "../../game/football/theme";

// ── İki oyuncuyu karşılaştır — FAZ İÇİ ───────────────────────────────────────
// Basketbol Compare'i herhangi iki oyuncuyu yan yana koyabiliyor, çünkü orada
// 12 noun herkese uygulanıyor. Futbolda bu anlamsız: bir kaleciyi bir santrafora
// 8 forvet arketibi üzerinde kıyaslayamazsın, kalecinin o skorları YOK.
// Bu yüzden sert kural: ikinci oyuncu birincinin FAZINDAN seçilir.

const PHASE_LABEL = { gk: "goalkeepers", def: "defenders", mid: "midfielders", fwd: "attackers" };

// Ham metrik karşılaştırması — faz'a göre değişir, nötr gruplamayla aynı mantık
const COMPARE_ROWS = {
  gk: [["saves_90", "Saves"], ["save_pct", "Save %"], ["goals_prevented_90", "Goals prevented"],
       ["keeper_sweeper_90", "Sweeper actions"], ["keeper_high_claim_90", "High claims"],
       ["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"],
       ["CLEAN_SHEETS", "Clean sheets"]],
  def: [["tackles_90", "Tackles"], ["interceptions_90", "Interceptions"],
        ["clearances_90", "Clearances"], ["aerials_won_90", "Aerials won"],
        ["aerial_pct", "Aerial %"], ["accurate_passes_att_90", "Passes"],
        ["pass_pct", "Pass %"], ["passes_into_final_third_90", "Into final third"],
        ["accurate_crosses_att_90", "Crosses"], ["CLEAN_SHEETS", "Clean sheets"]],
  mid: [["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"],
        ["passes_into_final_third_90", "Into final third"],
        ["chances_created_90", "Chances created"], ["expected_assists_90", "xA"],
        ["assists_90", "Assists"], ["tackles_90", "Tackles"],
        ["recoveries_90", "Recoveries"], ["dribbles_succeeded_90", "Dribbles"],
        ["touches_opp_box_90", "Opp. box touches"]],
  fwd: [["goals_90", "Goals"], ["expected_goals_non_penalty_90", "npxG"],
        ["total_shots_90", "Shots"], ["npxg_per_shot", "npxG / shot"],
        ["assists_90", "Assists"], ["expected_assists_90", "xA"],
        ["chances_created_90", "Chances created"], ["dribbles_succeeded_90", "Dribbles"],
        ["accurate_crosses_att_90", "Crosses"], ["touches_opp_box_90", "Opp. box touches"],
        ["aerials_won_90", "Aerials won"]],
};
const PCT = new Set(["pass_pct", "save_pct", "aerial_pct", "cross_pct",
  "ground_duel_pct", "dribble_pct", "long_pct", "sot_pct"]);
const COUNT = new Set(["CLEAN_SHEETS"]);
const fmt = (k, v) => v == null || Number.isNaN(v) ? "—"
  : COUNT.has(k) ? String(Math.round(v))
  : PCT.has(k) ? `${Math.round(v * 100)}%`
  : v >= 10 ? v.toFixed(1) : v.toFixed(2);

function DualRadar({ a, b, names, accent }) {
  const n = names.length;
  if (n < 3) return null;
  const cx = 150, cy = 138, R = 96;
  const at = (i, r) => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = (p) => names.map((k, i) =>
    at(i, R * Math.max(0, Math.min(1, p?.[`score_${k}`] ?? 0))).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 340 }}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={names.map((_, i) => at(i, R * f).join(",")).join(" ")}
          fill="none" stroke="var(--border)" strokeWidth="0.7" />
      ))}
      {names.map((_, i) => {
        const [x, y] = at(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.5" />;
      })}
      {b && <polygon points={poly(b)} fill="#E8654C30" stroke="#E8654C" strokeWidth="1.6" />}
      {a && <polygon points={poly(a)} fill={`${accent}30`} stroke={accent} strokeWidth="1.6" />}
      {names.map((k, i) => {
        const [x, y] = at(i, R + 20);
        return (
          <text key={k} x={x} y={y} fontSize="8" textAnchor="middle"
            dominantBaseline="middle" fill="var(--text-faint)">
            {k.length > 16 ? k.slice(0, 15) + "…" : k}
          </text>
        );
      })}
    </svg>
  );
}

export default function FootballCompare() {
  const [meta, setMeta]   = useState(null);
  const [season, setSeason] = useState("");
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  // Faz kısıtı: A seçilince B aynı fazdan aranır. A değişirse ve B başka
  // fazdaysa B düşer — yoksa ekranda kıyaslanamaz bir çift kalırdı.
  useEffect(() => {
    if (a && b && a.PHASE !== b.PHASE) setB(null);
  }, [a]);   // eslint-disable-line react-hooks/exhaustive-deps

  const phase = a?.PHASE || b?.PHASE || null;
  const accent = PHASE_COLOR[phase] || "#3FB08C";
  const archNames = phase && meta?.archetypes ? (meta.archetypes[phase] || []) : [];
  const rows = phase ? (COMPARE_ROWS[phase] || []) : [];

  const [detA, setDetA] = useState(null);
  const [detB, setDetB] = useState(null);
  useEffect(() => {
    if (!a) { setDetA(null); return; }
    api.footballPlayers({ season, search: a.PLAYER_NAME, phase: a.PHASE, limit: 5 })
      .then(r => setDetA((r.players || []).find(p => p.PLAYER_ID === a.PLAYER_ID) || null))
      .catch(() => setDetA(null));
  }, [a, season]);
  useEffect(() => {
    if (!b) { setDetB(null); return; }
    api.footballPlayers({ season, search: b.PLAYER_NAME, phase: b.PHASE, limit: 5 })
      .then(r => setDetB((r.players || []).find(p => p.PLAYER_ID === b.PLAYER_ID) || null))
      .catch(() => setDetB(null));
  }, [b, season]);

  return (
    <div className="h-full overflow-y-auto relative">
      <SEO title="Football — Compare Players"
        description="Two players side by side on the roles that actually apply to them."
        path="/football/compare" noindex />
      <div className="g-smoke" />

      <div className="relative max-w-4xl mx-auto p-5 space-y-3">
        {/* ── HEADER DOCK — Map sayfasıyla aynı iskelet ── */}
        <div className="g-dock" style={{ "--accent": ACCENT, "--accent-line": ACCENT + "55" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />

          <div className="g-dock-left">
            <h1 className="g-dock-title">Compare</h1>
            <p className="g-dock-sub">Two players · same phase only</p>
          </div>

          <div className="g-dock-center" />

          <div className="g-dock-right">
            <div className="g-seg" style={{ "--accent": ACCENT, "--accent-a": ACCENT + "22", "--accent-line": ACCENT + "66" }}>
              {[["/football/map", "Map"], ["/football/compare", "Compare"]].map(([to, l]) => (
                <a key={to} href={to}
                  className={`g-seg-btn${window.location.pathname === to ? " on" : ""}`}>{l}</a>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Both players must come from the same phase — a keeper has no score on
          the attacking roles, so putting him next to a striker would compare nothing.
        </p>

        <div className="g-panel p-4 space-y-3">
          <div className="flex gap-3 items-end">
            <div className="aura-select-wrap" style={{ minWidth: 120 }}>
              <select value={season} onChange={e => setSeason(e.target.value)}
                className="aura-select accent">
                {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <PlayerSearch label="Player A" value={a} onPick={setA}
              phase={b?.PHASE || null} season={season} accent={accent} />
            <PlayerSearch label="Player B" value={b} onPick={setB}
              phase={a?.PHASE || null} season={season} accent="#E8654C" />
          </div>
          {a && !b && (
            <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Player B is now limited to {PHASE_LABEL[a.PHASE]}.
            </div>
          )}
        </div>

        {(detA || detB) && (
          <>
            <div className="g-panel p-4 grid gap-4"
              style={{ gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              {[detA, detB].map((p, i) => (
                <div key={i} style={{ textAlign: i ? "right" : "left" }}>
                  <div className="text-[15px] font-bold text-white">{p?.PLAYER_NAME || "—"}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {p ? `${p.TEAM} · ${p.POSITION} · ${Math.round(p.MINUTES_TOTAL)}′` : ""}
                  </div>
                  <div className="text-[12px] mt-0.5"
                    style={{ color: i ? "#E8654C" : accent }}>{p?.primary_arch || ""}</div>
                  <div className="text-2xl font-bold mt-1"
                    style={{ color: i ? "#E8654C" : accent }}>
                    {p ? Math.round(p.overall_score * 100) : ""}
                  </div>
                </div>
              ))}
              {/* orta boşluk grid'in 2. sütunu */}
              <div />
            </div>

            {archNames.length > 0 && (
              <div className="g-panel p-4">
                <div className="g-label mb-2">
                  Archetype fit — {PHASE_LABEL[phase]}
                </div>
                <div className="flex justify-center">
                  <DualRadar a={detA} b={detB} names={archNames} accent={accent} />
                </div>
              </div>
            )}

            <div className="g-panel p-4">
              <div className="g-label mb-2">Per 90</div>
              <div className="space-y-0.5">
                {rows.map(([k, label]) => {
                  const va = detA?.[k], vb = detB?.[k];
                  const aWin = va != null && vb != null && va > vb;
                  const bWin = va != null && vb != null && vb > va;
                  return (
                    <div key={k} className="flex items-center text-[12px] py-0.5"
                      style={{ borderBottom: "1px solid var(--border)" }}>
                      <span style={{ flex: 1, textAlign: "right",
                                     color: aWin ? accent : "var(--text-muted)",
                                     fontWeight: aWin ? 700 : 400 }}>
                        {fmt(k, va)}
                      </span>
                      <span style={{ minWidth: 168, textAlign: "center",
                                     color: "var(--text-faint)", fontSize: 11 }}>
                        {label}
                      </span>
                      <span style={{ flex: 1,
                                     color: bWin ? "#E8654C" : "var(--text-muted)",
                                     fontWeight: bWin ? 700 : 400 }}>
                        {fmt(k, vb)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
