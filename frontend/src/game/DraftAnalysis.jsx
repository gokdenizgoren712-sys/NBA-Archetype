import { computeLineupFit, computePlayerFit } from "./lineupScore";
import { ERAS, ERA_PILLAR_WEIGHTS, ERA_HEX, ERA_META_BLURB } from "./eras";
import { POSITIONS, BENCH_SLOTS, getPrimaryPos } from "./positions";
import { getPlayerTags } from "./awards";
import { StarIcon, TrophyIcon, CoachIcon, BoltIcon, GapIcon } from "./GameIcons";
import "./game.css";

// ── Draft Analysis — simülasyon ÖNCESİ karne ─────────────────────────────
// vs modlarında (Same Screen / With a Friend) koçlar seçildikten sonra,
// ilk maç oynanmadan önce gösteriliyor: "elimde ne var, era beni nasıl
// vurdu, hangi sütunda açığım?" Klasik moddaki Era Report + Roster
// Breakdown'ın 1v1'e uyarlanmış hâli — iki kadro AYNI satırda karşılaştırılıyor.
//
// teams: [{ name, lineup, coach?, accent? }] — 1 ya da 2 takım. Tek takım
// verilirse tek sütun düzenine düşer (klasik mod ileride buraya bağlanacak).

const PILLARS = [
  ["creation", "Creation"],
  ["spacing", "Spacing"],
  ["rim_protection", "Rim Protection"],
  ["perimeter_d", "Perimeter D"],
  ["finishing", "Finishing"],
];

const GRADE_HEX = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
const gradeFor = (pct) => pct >= 85 ? "S" : pct >= 78 ? "A" : pct >= 70 ? "B" : pct >= 62 ? "C" : "D";
const VAL_HEX = (v) => v >= 0.75 ? "#4ade80" : v >= 0.55 ? "#facc15" : v >= 0.40 ? "#fb923c" : "#f87171";
const POS_HEX = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };
const pct100 = (v) => Math.round((v || 0) * 100);

// Era ağırlığı → etiket. Hangi sütunun bu era'da para ettiğini tek bakışta ver.
const weightTag = (w) => w >= 1.2 ? ["KEY", "#facc15"] : w >= 0.95 ? ["CORE", "#9ca3af"] : ["MINOR", "#475569"];

function TeamHero({ team, fit, align = "left" }) {
  const pct = pct100(fit.lineupScore);
  const grade = gradeFor(pct);
  const gHex = GRADE_HEX[grade];
  const right = align === "right";

  return (
    <div className={`flex-1 min-w-0 flex items-center gap-3${right ? " flex-row-reverse text-right" : ""}`}>
      <div className="relative shrink-0 w-[62px] h-[62px] rounded-2xl flex items-center justify-center"
        style={{ color: gHex, border: `1px solid ${gHex}55`, background: gHex + "14" }}>
        <span className="aura-blob" style={{ "--slot-color": gHex, left: "50%", top: -14, width: 100, height: 66, transform: "translateX(-50%)", opacity: 0.3 }} />
        <span className="relative font-logo font-black" style={{ fontSize: 30 }}>{grade}</span>
      </div>
      <div className="min-w-0">
        <div className="font-logo text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{team.name}</div>
        <div className="font-logo font-black tabular-nums leading-none mt-0.5" style={{ fontSize: 26, color: gHex }}>
          {pct}<span style={{ fontSize: 12, color: "var(--text-faint)" }}> / 100</span>
        </div>
        {team.coach && (
          <div className={`g-mono mt-1 inline-flex items-center gap-1${right ? " flex-row-reverse" : ""}`} style={{ color: "var(--text-faint)" }}>
            <CoachIcon size={11} /> {team.coach.name}
            {team.coach.champs > 0 && <span style={{ color: "var(--yamabuki)" }}>×{team.coach.champs}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Quality / Coverage / Role — üçü de 100 üzerinden
function Parts({ fit, align = "left" }) {
  const parts = [
    ["Quality", pct100(fit.avgQuality), "45%"],
    ["Coverage", pct100(fit.coverage), "40%"],
    ["Chemistry", pct100(fit.roleFit), "15%"],
  ];
  return (
    <div className={`flex gap-4${align === "right" ? " flex-row-reverse" : ""}`}>
      {parts.map(([label, v, w]) => (
        <div key={label} className={align === "right" ? "text-right" : ""}>
          <div className="font-logo font-black tabular-nums leading-none" style={{ fontSize: 19, color: VAL_HEX(v / 100) }}>{v}</div>
          <div className="text-[9.5px] mt-1" style={{ color: "var(--text-muted)" }}>{label}</div>
          <div className="g-mono" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>w {w}</div>
        </div>
      ))}
    </div>
  );
}

// Küçük renkli künye — era etkisi, pozisyon cezası, ödül etiketi
function Chip({ hex, title, children }) {
  return (
    <span className="g-rr-chip" title={title}
      style={{ "--c": hex, "--c-a": hex + "14", "--c-line": hex + "3d" }}>{children}</span>
  );
}

// Tek oyuncu satırı: ham overall → era/pozisyon sonrası kalite
function RosterRow({ pos, player, fit, bench }) {
  const pp = fit;
  const q = pct100(pp.quality);
  const base = Math.round((parseFloat(player.overall_score) || 0) * 100);
  const drop = base - q;
  const isPrimary = !bench && getPrimaryPos(player) === pos;
  const hex = bench ? "#6b7280" : (POS_HEX[pos] || "#9ca3af");
  const qHex = bench ? "#9ca3af" : VAL_HEX(q / 100);
  const tags = getPlayerTags(player).slice(0, 2);

  return (
    <div className={`g-rr${bench ? " bench" : ""}`}
      style={{ "--accent": hex, "--accent-a": hex + "1f", "--accent-line": hex + "4d" }}>
      <span className="g-rr-pos">{bench ? "BN" : pos}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="g-rr-name truncate">{player.PLAYER_NAME}</span>
          {isPrimary && (
            <span className="shrink-0" title="Slotted at their natural position — chemistry bonus"
              style={{ color: hex, filter: `drop-shadow(0 0 5px ${hex}aa)` }}><StarIcon size={10} /></span>
          )}
        </div>
        <div className="g-rr-meta">
          <span className="g-rr-arch">{player.primary_arch || "—"}</span>

          {/* Era etkisi — asıl merak edilen: kim ne kadar yedi? */}
          {pp.timeless ? (
            <Chip hex="#c084fc" title="Top-2 of their season — era distance ignored entirely">TIMELESS</Chip>
          ) : pp.dist > 0 ? (
            <Chip hex={drop >= 8 ? "#f87171" : drop > 0 ? "#fb923c" : "#9ca3af"}
              title={`${pp.era.short} player · ${pp.dist} era${pp.dist === 1 ? "" : "s"} away → ${drop > 0 ? `−${drop} power` : "no loss"}`}>
              −{pp.dist} era{drop > 0 ? ` · −${drop}` : ""}
            </Chip>
          ) : (
            <Chip hex="#4ade80" title="Home era — no distance loss">HOME ERA</Chip>
          )}

          {pp.fitShift < 0 && !pp.timeless && (
            <Chip hex="#4ade80" title="An archetype this era pays for — travels one era closer">FITS</Chip>
          )}
          {pp.posPenalty < 1 && (
            <Chip hex="#f87171" title="Out of position — quality is scaled down">
              {pp.posPenalty <= 0.75 ? "−25% POS" : "−10% POS"}
            </Chip>
          )}
          {tags.map(t => <Chip key={t.key} hex={t.color} title={t.detail}>{t.label}</Chip>)}
        </div>
      </div>

      <span className="g-rr-ovr" title={`Raw overall ${base} → ${q} after era distance and position fit`}>
        ovr {base}
      </span>
      <div className="g-bar-track shrink-0" style={{ height: 7, width: 56 }}>
        <div className="g-bar-fill" style={{ width: `${q}%`, "--fill": qHex, "--fill-a": qHex + "66" }} />
      </div>
      <span className="g-rr-val" style={{ color: qHex }}>{q}</span>
    </div>
  );
}

export default function DraftAnalysis({
  teams, simEra, label = "// Draft Analysis",
  // Klasik mod kendi dev skor kahramanını (g-score-hero) zaten gösteriyor;
  // burada tekrar etmesin diye ikisi de kapatılabiliyor.
  showHero = true, showParts = true,
  affinity = null,      // 0-100 — arketip uyumu, klasik modda hesaplanıyor
}) {
  const era = simEra || ERAS[5];
  const W = ERA_PILLAR_WEIGHTS[era.id];
  const eraHex = ERA_HEX[era.id] || "#9ca3af";

  const rows = teams.map(t => {
    const starters = POSITIONS.map(p => t.lineup?.[p]).filter(Boolean);
    const fit = computeLineupFit(starters, era);
    return { team: t, fit };
  }).filter(r => r.fit);

  if (rows.length === 0) return null;
  const duo = rows.length === 2;

  return (
    <div className="g-panel p-4 space-y-4">
      <span className="aura-blob" style={{ "--slot-color": eraHex, left: "35%", top: -50, width: 300, height: 150, opacity: 0.16 }} />

      <div className="flex items-center justify-between gap-2">
        <span className="g-mono" style={{ color: "var(--yamabuki)" }}>{label}</span>
        <div className="flex items-center gap-2">
          {affinity != null && (
            <span className="g-status" style={{ "--accent": "#c084fc", "--accent-a": "rgba(192,132,252,.14)", "--accent-line": "rgba(192,132,252,.45)" }}
              title="Archetype affinity — average pairwise synergy across the starting five">
              ⬡ {affinity} synergy
            </span>
          )}
          <span className="g-status" style={{ "--accent": eraHex, "--accent-a": eraHex + "1f", "--accent-line": eraHex + "55" }}>
            {era.label}
          </span>
        </div>
      </div>

      {/* Notlar — iki takım kortun iki ucu gibi karşılıklı */}
      {showHero && (
        <div className={`flex items-center gap-4${duo ? "" : " justify-start"}`}>
          <TeamHero team={rows[0].team} fit={rows[0].fit} />
          {duo && <span className="font-logo font-black shrink-0" style={{ fontSize: 20, color: "rgba(255,255,255,.14)" }}>VS</span>}
          {duo && <TeamHero team={rows[1].team} fit={rows[1].fit} align="right" />}
        </div>
      )}

      {showParts && (
        <div className={`flex items-start gap-4${showHero ? " pt-3.5" : ""}${duo ? " justify-between" : ""}`}
          style={showHero ? { borderTop: "1px solid rgba(255,255,255,.07)" } : null}>
          <Parts fit={rows[0].fit} />
          {duo && <Parts fit={rows[1].fit} align="right" />}
        </div>
      )}

      {/* 5 sütun — era ağırlığı ortada, iki takım iki yanda (ayna barlar) */}
      <div className={showHero || showParts ? "pt-3.5" : ""}
        style={showHero || showParts ? { borderTop: "1px solid rgba(255,255,255,.07)" } : null}>
        <div className="g-label mb-2.5">Five Pillars · weighted for the {era.label}</div>
        <div className="space-y-2">
          {PILLARS.map(([key, plabel]) => {
            const [tag, tagHex] = weightTag(W[key]);
            const a = rows[0].fit[key], b = duo ? rows[1].fit[key] : null;

            // TEK takım: ayna düzenine gerek yok — etiket solda, bar tüm
            // genişliği alır, değer sağda. (Ayna düzeni tek takımda sağ yarıyı
            // boş bırakıyordu, kutu yarısına kadar doluyordu.)
            if (!duo) {
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <span className="text-[11.5px] shrink-0 text-right" style={{ width: 96, color: "var(--text-muted)" }}>{plabel}</span>
                  <span className="text-[8px] font-bold px-1.5 py-px rounded-full shrink-0 w-[46px] text-center"
                    style={{ color: tagHex, border: `1px solid ${tagHex}55`, background: tagHex + "14" }}
                    title={`Weight in the ${era.label}: ×${W[key].toFixed(2)}`}>{tag}</span>
                  <div className="g-bar-track flex-1" style={{ height: 8 }}>
                    <div className="g-bar-fill" style={{ width: `${pct100(a)}%`, "--fill": VAL_HEX(a), "--fill-a": VAL_HEX(a) + "66" }} />
                  </div>
                  <span className="font-logo text-[12.5px] font-bold w-7 text-right shrink-0 tabular-nums"
                    style={{ color: VAL_HEX(a) }}>{pct100(a)}</span>
                </div>
              );
            }

            return (
              <div key={key} className="g-pillar-row flex items-center gap-2">
                {/* sol takım — bar sağdan sola dolar */}
                <span className="font-logo text-[11.5px] font-bold w-6 text-right shrink-0 tabular-nums"
                  style={{ color: VAL_HEX(a) }}>{pct100(a)}</span>
                <div className="g-bar-track flex-1" style={{ height: 8, transform: "scaleX(-1)" }}>
                  <div className="g-bar-fill" style={{ width: `${pct100(a)}%`, "--fill": VAL_HEX(a), "--fill-a": VAL_HEX(a) + "66" }} />
                </div>

                <div className="g-pillar-label shrink-0 text-center" style={{ width: 108 }}>
                  <div className="text-[11px] leading-none" style={{ color: "var(--text-muted)" }}>{plabel}</div>
                  <span className="text-[8px] font-bold px-1.5 py-px rounded-full inline-block mt-1"
                    style={{ color: tagHex, border: `1px solid ${tagHex}55`, background: tagHex + "14" }}
                    title={`Weight in the ${era.label}: ×${W[key].toFixed(2)}`}>{tag}</span>
                </div>

                <div className="g-bar-track flex-1" style={{ height: 8 }}>
                  <div className="g-bar-fill" style={{ width: `${pct100(b)}%`, "--fill": VAL_HEX(b), "--fill-a": VAL_HEX(b) + "66" }} />
                </div>
                <span className="font-logo text-[11.5px] font-bold w-6 shrink-0 tabular-nums" style={{ color: VAL_HEX(b) }}>{pct100(b)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap mt-2.5">
          <p className="text-[11px] leading-relaxed flex-1 min-w-[220px]" style={{ color: "var(--text-faint)" }}>
            {ERA_META_BLURB[era.id]}
          </p>
          {/* Eski Era Report'un iki ayrı satırı — şutör sayısı ve top-hog uyarısı
              — burada tek satırlık künyeye indi. */}
          <span className="g-mono shrink-0" style={{ color: "var(--text-faint)" }}>
            {rows.map(r => `${r.fit.nShooters} shooter${r.fit.nShooters === 1 ? "" : "s"}`).join(" · ")}
            {rows.some(r => r.fit.roleFit < 1) && " · chemistry penalty"}
          </span>
        </div>
      </div>

      {/* Her takımın silahı ve açığı — era ağırlığıyla sıralanmış */}
      <div className={`grid gap-3 pt-3.5${duo ? " sm:grid-cols-2" : ""}`} style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {rows.map(({ team, fit }) => {
          const scored = PILLARS.map(([k, l]) => ({ k, l, val: fit[k], w: W[k] }));
          const weapon = [...scored].sort((x, y) => (y.w * y.val) - (x.w * x.val))[0];
          const gap = [...scored].sort((x, y) => (y.w * (1 - y.val)) - (x.w * (1 - x.val)))[0];
          return (
            <div key={team.name} className="min-w-0 space-y-1.5">
              {duo && <div className="g-mono truncate" style={{ color: "var(--text-faint)" }}>{team.name}</div>}
              <div className="flex gap-2 items-start">
                <span className="shrink-0 mt-0.5" style={{ color: "#4ade80" }}><BoltIcon size={14} /></span>
                <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  <b style={{ color: "var(--text-primary)" }}>Weapon:</b>{" "}
                  <span style={{ color: "#4ade80" }}>{weapon.l} ({pct100(weapon.val)})</span>
                  {weapon.w >= 1.2 ? " — exactly what this era pays for." : weapon.w >= 0.95 ? " — solid currency here." : " — this era barely values it."}
                </p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="shrink-0 mt-0.5" style={{ color: "#f87171" }}><GapIcon size={14} /></span>
                <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  <b style={{ color: "var(--text-primary)" }}>Gap:</b>{" "}
                  <span style={{ color: "#f87171" }}>{gap.l} ({pct100(gap.val)})</span>
                  {gap.w >= 1.2 && <span style={{ color: "var(--yamabuki)" }}> — a KEY pillar here, it will cost games.</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Kadrolar — ham overall'lar artık açık, era kesintisi satır satır */}
      <div className={`grid gap-x-5 gap-y-1 pt-3.5${duo ? " sm:grid-cols-2" : ""}`} style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {rows.map(({ team }) => (
          <div key={team.name} className="min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="g-label">{team.name}</div>
              {team.coach?.champs > 0 && (
                <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: "var(--yamabuki)" }}>
                  <TrophyIcon size={10} />×{team.coach.champs}
                </span>
              )}
            </div>
            {POSITIONS.map(pos => {
              const p = team.lineup?.[pos];
              return p ? <RosterRow key={pos} pos={pos} player={p} fit={computePlayerFit(p, era)} /> : null;
            })}
            {BENCH_SLOTS.map(b => {
              const p = team.lineup?.[b];
              return p ? <RosterRow key={b} pos={b} player={p} fit={computePlayerFit(p, era)} bench /> : null;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
