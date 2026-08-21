import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import { MAP_ANCHORS, placeOnMap } from "../../game/football/mapAnchors";
import "../../game/game.css";
import { LEAGUE_LABEL } from "../../game/football/leagues";

// ── Arketip haritası — FAZ BAŞINA ────────────────────────────────────────────
// Basketbolun Explore haritası tek düzlem, çünkü orada bütün oyuncular aynı 12
// boyutla ölçülüyor. Futbolda tek harita yanlış olurdu: bir kaleciyle bir
// santraforun ortak ekseni yok, eksenlerin anlamı bulanıklaşırdı. Kullanıcı
// kararı da bu yöndeydi — dört ayrı harita, her biri kendi gerilimiyle.

const ACCENT = "#3FB08C";
const PHASES = [
  { key: "gk",  label: "Goalkeepers", color: "#F2C14E" },
  { key: "def", label: "Defenders",   color: "#4C9BE8" },
  { key: "mid", label: "Midfielders", color: "#3FB08C" },
  { key: "fwd", label: "Attackers",   color: "#E8654C" },
];

export default function FootballMap() {
  const [meta, setMeta]     = useState(null);
  const [season, setSeason] = useState("");
  const [phase, setPhase]   = useState("mid");
  const [league, setLeague] = useState("");
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [hover, setHover]   = useState(null);
  const [sel, setSel]       = useState(null);
  const [q, setQ]           = useState("");
  // Arketip filtresi — seçilince harita o role odaklanır
  const [arch, setArch]     = useState("");

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  useEffect(() => {
    if (!season) return;
    setLoading(true); setSel(null);
    api.footballPlayers({ season, phase, limit: 600,
                          ...(league ? { league } : {}) })
      .then(r => setRows(r.players || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [season, phase, league]);

  // Arketipler faza özgü: faz değişince eski seçim anlamsız kalır.
  useEffect(() => { setArch(""); }, [phase]);

  const cfg = MAP_ANCHORS[phase];
  // Bu fazın arketip listesi — çapa tanımları zaten faz bazlı, tek kaynak.
  const archOptions = Object.keys(MAP_ANCHORS[phase]?.points || {});
  const archPoint = arch ? MAP_ANCHORS[phase]?.points?.[arch] : null;
  const accent = PHASES.find(p => p.key === phase)?.color || "#3FB08C";

  const dots = useMemo(() => rows.map(p => {
    const pt = placeOnMap(p, phase);
    return pt ? { ...p, ...pt } : null;
  }).filter(Boolean), [rows, phase]);

  const qq = q.trim().toLowerCase();

  // Kutu olcusu layout-effect ile aliniyor (ResizeObserver DEGIL): observer
  // frame dongusune bagli, ilk boyamada gec kalabiliyor. Filtre paneli sarinca
  // haritanin yuksekligi degistigi icin meta/faz degisiminde de yeniden olculuyor.
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 760, h: 560 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width - 16), h = Math.round(r.height - 16);  // p-2
      if (w > 40 && h > 40)
        setBox(b => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [meta, loading, phase, arch, league]);

  // Kisa kutuda sabit 54px kenar payi cizim alanini bogar — yukseklikle olcekle.
  const W = box.w, H = box.h;
  const PAD = Math.max(26, Math.min(54, Math.round(H * 0.1)));
  const sx = v => PAD + v * (W - PAD * 2);
  const sy = v => PAD + v * (H - PAD * 2);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <SEO title="Football — Archetype Map"
        description="Every player placed by role. Nearby players play the same way."
        path="/football/map" noindex />
      <div className="g-smoke" />

      <div className="relative max-w-5xl w-full mx-auto p-5 flex-1 flex flex-col min-h-0 gap-3">
        {/* ── HEADER DOCK — sol kimlik, orta sezon, sag Explore sekmeleri ── */}
        <div className="g-dock shrink-0" style={{ "--accent": ACCENT, "--accent-line": ACCENT + "55" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />

          <div className="g-dock-left">
            <h1 className="g-dock-title">Archetype Map</h1>
            <p className="g-dock-sub">One map per phase · nearby dots play alike</p>
          </div>

          <div className="g-dock-center">
            <div className="aura-select-wrap">
              <select value={season} onChange={e => setSeason(e.target.value)}
                className="aura-select accent">
                {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="g-dock-right">
            {/* Explore alt sekmeleri — basketboldaki ExploreHub'ın karşılığı,
                oyun modundaki segmented switcher diliyle. */}
            <div className="g-seg" style={{ "--accent": ACCENT, "--accent-a": ACCENT + "22", "--accent-line": ACCENT + "66" }}>
              {[["/football/map", "Map"], ["/football/compare", "Compare"]].map(([to, l]) => (
                <a key={to} href={to}
                  className={`g-seg-btn${window.location.pathname === to ? " on" : ""}`}>{l}</a>
              ))}
            </div>
          </div>
        </div>

        <div className="g-panel p-3 shrink-0 flex flex-wrap gap-2 items-center"
          style={{ "--accent": ACCENT, "--accent-line": ACCENT + "3d" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: "8%", top: -38, width: 180, height: 96, opacity: 0.12 }} />
          <span className="g-label shrink-0">Phase</span>
          {PHASES.map(p => (
            <button key={p.key} onClick={() => setPhase(p.key)}
              className={`aura-pill-btn${phase === p.key ? " active" : ""}`}>
              {p.label}
            </button>
          ))}
          {/* Arketip filtresi — seçilince harita o role geçiyor: yalnızca o
              roldeki oyuncular renkli kalıyor, çapası referans olarak
              beliriyor ve eksen etiketleri aynı kalıyor (aynı düzlem). */}
          <span className="g-label shrink-0" style={{ marginLeft: 8 }}>Archetype</span>
          <div className="aura-select-wrap">
            <select value={arch} onChange={e => setArch(e.target.value)}
              className={`aura-select${arch ? " accent" : ""}`}>
              <option value="">All archetypes</option>
              {archOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Highlight a player…" className="aura-ghost-input"
            style={{ width: 150 }} />
          {(meta?.leagues || []).map(l => (
            <button key={l} onClick={() => setLeague(league === l ? "" : l)}
              className={`aura-pill-btn${league === l ? " active" : ""}`}>
              {LEAGUE_LABEL[l] || l}
            </button>
          ))}
          <span className="text-[11px] ml-auto" style={{ color: "var(--text-faint)" }}>
            {arch
              ? <><b style={{ color: accent }}>{dots.filter(d => d.primary_arch === arch).length}</b> {arch} · {dots.length} total</>
              : <>{dots.length} players</>}
          </span>
          {arch && (
            <button onClick={() => setArch("")} className="aura-pill-btn">✕ Clear role</button>
          )}
        </div>

        <div ref={wrapRef} className="g-panel p-2 flex-1 min-h-0"
          style={{ position: "relative", minHeight: 260 }}>
          {loading ? (
            <div className="h-full grid place-items-center text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
              style={{ width: "100%", height: "100%", display: "block" }}>
              {/* Eksen etiketleri */}
              <text x={PAD} y={H - 12} fontSize="11" fill="var(--text-faint)">
                ← {cfg?.axes.x[0]}
              </text>
              <text x={W - PAD} y={H - 12} fontSize="11" fill="var(--text-faint)"
                textAnchor="end">{cfg?.axes.x[1]} →</text>
              <text x={14} y={PAD - 14} fontSize="11" fill="var(--text-faint)">
                ↑ {cfg?.axes.y[0]}
              </text>
              <text x={14} y={H - PAD + 22} fontSize="11" fill="var(--text-faint)">
                ↓ {cfg?.axes.y[1]}
              </text>
              <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2}
                fill="none" stroke="var(--border)" strokeWidth="1" rx="6" />

              {/* Arketip çapaları (halka + isim) KALDIRILDI — kullanıcı kararı:
                  haritayı kalabalıklaştırıyordu. Yerine, bir arketip
                  seçildiğinde YALNIZCA onun çapası referans olarak gösteriliyor
                  (aşağıda), böylece "bu rol haritanın neresinde" sorusu
                  cevaplanıyor ama boştaki harita temiz kalıyor. */}
              {archPoint && (
                <g>
                  <circle cx={sx(archPoint.x)} cy={sy(archPoint.y)} r="7"
                    fill="none" stroke={accent} strokeWidth="1.4" opacity="0.75"
                    strokeDasharray="3 3" />
                  <text x={sx(archPoint.x)} y={sy(archPoint.y) - 12} fontSize="11"
                    textAnchor="middle" fill={accent} style={{ fontWeight: 700 }}>
                    {arch}
                  </text>
                </g>
              )}

              {/* Oyuncular */}
              {dots.map(p => {
                const match = !qq || p.PLAYER_NAME.toLowerCase().includes(qq);
                // Arketip seçiliyse o role ait olmayanlar geri plana düşer —
                // silinmiyor, çünkü rolün komşularını görmek haritanın anlamı.
                const inArch = !arch || p.primary_arch === arch;
                const isSel = sel?.PLAYER_ID === p.PLAYER_ID;
                const dimmed = (qq && !match) || !inArch;
                return (
                  <circle key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`}
                    cx={sx(p.x)} cy={sy(p.y)}
                    r={isSel ? 6 : (qq && match) || (arch && inArch) ? 4.6 : 3.2}
                    fill={isSel || (qq && match) || (arch && inArch) ? accent : `${accent}88`}
                    stroke={isSel ? "#fff" : "none"} strokeWidth="1.5"
                    opacity={dimmed ? 0.07 : 0.85}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSel(isSel ? null : p)} />
                );
              })}
            </svg>
          )}

          {(hover || sel) && (
            <div className="g-panel absolute px-3 py-2.5"
              style={{ right: 12, top: 12, minWidth: 190, pointerEvents: "none",
                       "--accent": accent, "--accent-line": accent + "80" }}>
              <span className="aura-blob" style={{ "--slot-color": accent, right: -18, top: -20, width: 110, height: 66, opacity: 0.22 }} />
              {(() => {
                const p = hover || sel;
                return (
                  <>
                    <div className="text-[12.5px] font-bold text-white">{p.PLAYER_NAME}</div>
                    <div className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      {p.TEAM} · {p.POSITION}
                    </div>
                    <div className="text-[11.5px] mt-1" style={{ color: accent }}>
                      {p.primary_arch}
                    </div>
                    <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                      overall {Math.round((p.overall_score || 0) * 100)} ·
                      fit {Math.round((p.primary_score || 0) * 100)}
                      {p.alt_arch ? ` · then ${p.alt_arch}` : ""}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="text-[10.5px] shrink-0 leading-snug" style={{ color: "var(--text-faint)" }}>
          Each phase gets its own map — keepers and strikers share no axis. A player
          sits at the weighted average of the roles he matches; anchors are laid out
          by hand for readability, not a measured embedding.
        </div>
      </div>
    </div>
  );
}
