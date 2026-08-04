import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB, ERA_PILLAR_WEIGHTS, ERA_HEX, getEra } from "../game/eras";
import { computePlayerFit, computeLineupFit, computeAffinity } from "../game/lineupScore";
import SeasonSimPanel from "../game/SeasonSimPanel";
import { COACHES } from "../game/coaches";
import { ERA_GUIDE } from "../data/glossary";
import { getPlayerTags, TAG_INFO } from "../game/awards";
import CourtBoard from "../game/CourtBoard";
import { START_BUDGET, MIN_COST, costColor, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import {
  StarIcon, CoachIcon, TrophyIcon, CrownIcon, CapIcon, TargetIcon, WheelIcon,
  TagIcon, RefreshIcon, CalendarIcon, BoltIcon, UsersIcon,
  SearchIcon, LoopIcon, GapIcon, WarnIcon, EyeIcon, LinkIcon, CheckIcon,
  DownloadIcon, XLogoIcon, DiceIcon, LightbulbIcon, InfoIcon,
} from "../game/GameIcons";
import {
  POSITIONS, BENCH_SLOTS, ALL_SLOTS, ARCH_POSITIONS, POS_STRING_MAP,
  POS_COLORS, getPrimaryPos, getSecondaryPos, getEligiblePos, isFlex, posPenaltyFor,
} from "../game/positions";
import InlineSpin from "../game/InlineSpin";
import LineupSlot from "../game/LineupSlot";
import PlayerRow, { posGroupOf } from "../game/PlayerRow";
import InfoModal from "../game/InfoModal";
import JokerBtn from "../game/JokerBtn";
import HowItWorksPanel from "../game/HowItWorksPanel";
import CoachPicker from "../game/CoachPicker";
import DraftAnalysis from "../game/DraftAnalysis";
import LeaderboardPanel from "../game/LeaderboardPanel";
import "../game/game.css";

// Not: aşağıdaki hex haritaları CSS custom property'lere (accent / glow) besleniyor;
// Tailwind sınıfı ile alfa-suffix birleştirilemediği için gerçek hex gerekiyor.
const GRADE_HEX = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
const POS_HEX   = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };
// Pillar/kalite barları için sürekli kalite skalası (Lineups sayfasıyla aynı).
const VAL_HEX = (v) => v >= 0.75 ? "#4ade80" : v >= 0.55 ? "#facc15" : v >= 0.40 ? "#fb923c" : "#f87171";

// ── Skorlama çekirdeği ────────────────────────────────────────────────────────
// computePlayerFit / computeLineupFit / computeAffinity → game/lineupScore.js'e
// taşındı (v3.9 / G3): UI ve headless backtest (scripts/backtest.mjs) aynı saf
// mantığı tek kaynaktan kullanır.

// ── Era sistemi — src/game/eras.js'ten import edilir ─────────────────────────
// (Era Fit paneli v3.6'da kaldırıldı; Faz B'de era etkisi dönem-uzaklığına taşınacak)

// [alan, etiket] — 3P% alan adı FG3_PCT
const SORT_KEYS = [
  ["TAGGED", "TAGGED"], ["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"],
  ["FG3_PCT", "3P%"], ["STL", "STL"], ["BLK", "BLK"],
];

// ── Sonuç ekranı ──────────────────────────────────────────────────────────────
function ScoreReveal({ fit, lineup, primaryCount, onReset, lang, affinityMatrix, simEra, coach, mode="classic" }) {
  const { isLoggedIn, token } = useAuth();
  const chemBonus = primaryCount * 0.02;
  const rawScore  = fit.lineupScore;
  const totalScore = Math.min(1, rawScore + chemBonus);
  const pct  = Math.round(totalScore * 100);
  // Eşikler ağırlıklı-toplam bandına göre: tipik çekiliş ~66-72 (C+/B), iyi ~78 (A), efsane 85+ (S)
  const grade = pct>=85?"S":pct>=78?"A":pct>=70?"B":pct>=62?"C":"D";

  // Archetype affinity score — v3.8: her oyuncunun TOP-3 arketibinin ağırlıklı
  // profili üzerinden (sadece birincil arketip değil). Çift affinity'si iki
  // oyuncunun tüm arketip-çifti kombinasyonlarının ağırlıklı ortalamasıdır.
  const affinityScore = (() => {
    const a = computeAffinity(POSITIONS.map(p => lineup[p]), affinityMatrix);
    return a == null ? null : Math.round(a * 100);
  })();

  const [leaderboard, setLeaderboard] = useState(null);

  // Auto-save score (once on mount, if logged in)
  useEffect(() => {
    if (!isLoggedIn || !token) return;
    const filled = ALL_SLOTS.map(p => lineup[p]).filter(Boolean);
    const players = filled.map(p => p.PLAYER_NAME);
    // Faz 4 (Board Challenge): salarycap kadroları roster_json'a da yazılmalı,
    // yoksa Board hiçbir zaman dolmaz — lineup[p] zaten /api/game/players'ın
    // döndürdüğü tam satır (primary_arch/overall_score/score_*) + pick sırasında
    // eklenen _season/_cost/_posPenalty'yi taşıyor, ek bir fetch gerekmiyor.
    const roster = mode === "salarycap" && filled.length === ALL_SLOTS.length ? filled : [];
    fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pct, grade, lineup: players, mode, roster }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaderboard — mod bazlı
  useEffect(() => {
    fetch(`/api/leaderboard?limit=10&mode=${mode}`).then(r => r.json()).then(d => setLeaderboard(d.entries || [])).catch(() => {});
  }, [mode]);

  const coveragePct = Math.round((fit.coverage || 0) * 100);
  const qualityPct  = Math.round((fit.avgQuality || 0) * 100);

  // Kadro Kaydetme — bkz. docs/online-architecture-review-and-roadmap.md Faz 1.
  // roster, lineup[p] objelerinin kendisi: /api/game/players'ın döndürdüğü tam
  // satır (primary_arch/overall_score/score_*) + pick sırasında eklenen
  // _season/_cost/_posPenalty — Board Challenge'daki roster_json ile AYNI şekil.
  const [saveName, setSaveName] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveErr, setSaveErr] = useState("");
  const saveRoster = () => {
    if (!saveName.trim()) { setSaveErr("Give the roster a name."); return; }
    const roster = ALL_SLOTS.map(p => lineup[p]).filter(Boolean);
    if (roster.length !== ALL_SLOTS.length) return;
    setSaveStatus("saving"); setSaveErr("");
    fetch("/api/rosters", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: saveName.trim(), source_mode: "single", mode, sim_era: simEra?.id || null,
        roster, overall_pct: pct, grade,
      }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setSaveStatus("error"); setSaveErr(d.detail || "Could not save"); return; }
        setSaveStatus("saved");
      })
      .catch(() => { setSaveStatus("error"); setSaveErr("Connection error"); });
  };

  return (
    <div className="space-y-4">
      {/* Ana skor — oyunun ödül anı: not harfi devasa, kendi renginde parlıyor */}
      {(() => {
        const gHex = GRADE_HEX[grade] || "#9ca3af";
        return (
          <div className="g-score-hero"
            style={{ "--accent": gHex, "--accent-a": gHex + "40", "--accent-line": gHex + "55" }}>
            <div className="g-holo" />
            <span className="aura-blob" style={{ "--slot-color": gHex, left: "50%", top: -40, width: 320, height: 190, transform: "translateX(-50%)", opacity: 0.3 }} />

            <div className="g-label center mb-3">Lineup Fit</div>
            {simEra && (
              <div className="mb-4">
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                  style={{ color: gHex, border: `1px solid ${gHex}44`, background: gHex + "14" }}>
                  built for the {simEra.label}
                </span>
              </div>
            )}

            <div className="g-score-grade">{grade}</div>
            <div className="g-score-pct mt-2">{pct}<span style={{ fontSize: 15, color: "var(--text-faint)" }}> / 100</span></div>

            {chemBonus > 0 && (
              <div className="text-[11px] mt-3 inline-flex items-center gap-1.5" style={{ color: "var(--yamabuki)" }}>
                <StarIcon size={11} /> Chemistry bonus · {primaryCount} primary slot{primaryCount === 1 ? "" : "s"} (+{Math.round(chemBonus * 100)})
              </div>
            )}

            {/* Skor bileşenleri: 45% kalite + 40% kapsama + 15% rol */}
            <div className="g-score-parts max-w-sm mx-auto">
              {[
                ["Quality",  qualityPct,                    "45%"],
                ["Coverage", coveragePct,                   "40%"],
                ["Role Fit", Math.round(fit.roleFit * 100), "15%"],
              ].map(([label, val, w]) => (
                <div key={label} className="g-score-part">
                  <div className="v" style={{ color: VAL_HEX(val / 100) }}>{val}</div>
                  <div className="l">{label}</div>
                  <div className="w">weight {w}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Kadro Kaydetme — bkz. docs/online-architecture-review-and-roadmap.md Faz 1 */}
      {isLoggedIn && (
        <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          {saveStatus === "saved" ? (
            <div className="text-sm font-medium" style={{ color: "var(--yamabuki)" }}>
              ✓ Roster saved — find it on your Profile page.
            </div>
          ) : (
            <>
              <div className="g-label mb-2">Save this roster</div>
              <div className="flex gap-2">
                <input
                  type="text" value={saveName} maxLength={60}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g. Fear the Deer 2011"
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                />
                <button
                  onClick={saveRoster}
                  disabled={saveStatus === "saving" || !saveName.trim()}
                  className="px-4 py-2 rounded-lg font-logo text-sm font-bold uppercase tracking-wide bg-yamabuki text-darkBg hover:bg-white transition-colors disabled:opacity-50">
                  {saveStatus === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
              {saveErr && <p className="text-xs text-red-400 mt-2">{saveErr}</p>}
            </>
          )}
        </div>
      )}

      {/* Sezon simülasyonu (v3.5) */}
      <SeasonSimPanel
        players={POSITIONS.map(p => lineup[p]).filter(Boolean)}
        bench={BENCH_SLOTS.map(p => lineup[p]).filter(Boolean)}
        coach={coach}
        simEra={simEra || ERAS[5]}
        fit={fit}
        affinity01={affinityScore != null ? affinityScore / 100 : null}
      />

      {/* Draft Analysis — eski "Roster Breakdown" + "Era Report" panellerinin
          yerini aldı. Aynı bilgiyi tek panelde veriyor: 5 sütun era
          ağırlıklarıyla, silah/açık, ve kadro satırlarında ham overall →
          era/pozisyon sonrası kalite. Skor kahramanı yukarıda zaten var,
          o yüzden showHero/showParts kapalı. "Şunu almalıydın" önerisi
          bilinçli olarak kaldırıldı — oyun bittikten sonra suçlayıcı
          duruyordu ve zaten oynanamayan bir tavsiyeydi. */}
      <DraftAnalysis
        simEra={simEra}
        affinity={affinityScore}
        showHero={false}
        showParts={false}
        label="// Draft Analysis"
        teams={[{ name: "Your Roster", lineup, coach }]}
      />


      {/* Share butonu */}
      <ShareCard pct={pct} grade={grade} fit={fit} lineup={lineup} simEra={simEra} coach={coach} />

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="g-panel p-4 space-y-2">
          <div className="g-label mb-1">
            <span>Top Scores</span>
            {mode==="salarycap"&&<span className="inline-flex items-center gap-1" style={{color:"#4ade80"}}>· <CapIcon size={12} /> Salary Cap</span>}
          </div>
          {leaderboard.slice(0, 10).map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-gray-700 w-5 text-right shrink-0 font-mono">{i + 1}.</span>
              <span className="text-gray-300 flex-1 truncate">{entry.username}</span>
              {entry.season_result === "THREEPEAT" && <span className="shrink-0 text-yamabuki" title="THREEPEAT — three straight simulated titles"><CrownIcon size={13} /></span>}
              {entry.season_result === "REPEAT" && <span className="shrink-0 text-yamabuki inline-flex" title="Back-to-back simulated champion"><TrophyIcon size={12} /><TrophyIcon size={12} /></span>}
              {entry.season_result === "CHAMPION" && <span className="shrink-0 text-yamabuki" title="Won a simulated championship"><TrophyIcon size={12} /></span>}
              {entry.wins != null && <span className="text-gray-600 shrink-0 text-[10px]">{entry.wins}W</span>}
              <span className={`font-bold shrink-0 ${entry.pct>=85?"text-blue-400":entry.pct>=78?"text-sky-300":entry.pct>=70?"text-emerald-400":entry.pct>=62?"text-yamabuki":"text-red-400"}`}>
                {entry.pct}
              </span>
              <span className="text-gray-600 shrink-0 w-4">{entry.grade}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onReset} className="aura-rating-btn w-full" style={{padding:"13px",fontSize:15}}>
        <LoopIcon size={15} /> <span className="ml-2">Play Again</span>
      </button>
    </div>
  );
}

// ── Paylaşım kartı — canvas üzerinde çizilir ─────────────────────────────────
function ShareCard({ pct, grade, fit, lineup, simEra, coach }) {
  const simEraObj = simEra || ERAS[5];
  const simEraLabel = simEraObj?.label || null;
  const coachName = coach?.name || null;
  const [preview, setPreview] = useState(null);
  const [copied, setCopied]   = useState(false);

  const SITE_URL = typeof window !== "undefined" ? window.location.origin : "https://nba-archetype.onrender.com";

  // ── Paylaşım görseli ────────────────────────────────────────────────────
  // Sitenin tasarım dilinin canvas'a çevrilmiş hâli: koyu zemin + nokta
  // matrisi + holo şeritler + aura parıltısı, Rajdhani başlıklar, mevki
  // rozetleri, era-ağırlıklı sütun barları. Sağ altta logo + isim.
  const TXT = { primary: "#f2efea", muted: "#b4afa8", faint: "#8b857e" };
  const GH = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
  const PH = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };
  const vHex = (v) => v >= 0.75 ? "#4ade80" : v >= 0.55 ? "#facc15" : v >= 0.40 ? "#fb923c" : "#f87171";

  // Logo işareti — favicon.svg ile birebir aynı geometri (12-gen + dikiş
  // çizgileri). Kartın hem üstünde hem sağ alt imzasında kullanılıyor.
  const drawMark = (ctx, cx, cy, size) => {
    const s = size / 48, r = (x, y) => [cx + (x - 24) * s, cy + (y - 24) * s];
    const pts = [[24,4],[34,6.7],[41.3,14],[44,24],[41.3,34],[34,41.3],[24,44],[14,41.3],[6.7,34],[4,24],[6.7,14],[14,6.7]];
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "#FFB11B"; ctx.lineWidth = 4 * s;
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [px, py] = r(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath(); ctx.stroke();
    const seam = (x1,y1,cx1,cy1,cx2,cy2,x2,y2,color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 4 * s;
      const [ax,ay] = r(x1,y1), [b1,b2] = r(cx1,cy1), [c1,c2] = r(cx2,cy2), [dx,dy] = r(x2,y2);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(b1, b2, c1, c2, dx, dy); ctx.stroke();
    };
    seam(14, 6.7, 22, 18, 22, 30, 14, 41.3, "#1d428a");
    seam(34, 6.7, 26, 18, 26, 30, 34, 41.3, "#c8102e");
    ctx.strokeStyle = "#00A3AF"; ctx.lineWidth = 4 * s;
    const [l1, l2] = r(4, 24), [m1, m2] = r(44, 24);
    ctx.beginPath(); ctx.moveTo(l1, l2); ctx.lineTo(m1, m2); ctx.stroke();
  };

  const buildCanvas = () => {
    // Yükseklik içeriğe göre ölçüldü: 5 kadro satırı + 5 sütun + imza şeridi.
    // 750'de altta ~130px ölü alan kalıyordu.
    const W = 1200, H = 672, P = 52;
    const canvas = document.createElement("canvas");
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.textBaseline = "alphabetic";

    const gHex = GH[grade] || "#9ca3af";
    const font = (w, s, f = "Rajdhani") => { ctx.font = `${w} ${s}px ${f}, system-ui, sans-serif`; };
    const body = (w, s) => { ctx.font = `${w} ${s}px Outfit, system-ui, sans-serif`; };

    // ── Zemin: dikey gradyan + köşe aurası ──
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H);
    bg.addColorStop(0, "#14111b"); bg.addColorStop(0.55, "#0b0a0e"); bg.addColorStop(1, "#100d0a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Aura blob — not karesinin ARKASINDA, başlığı boyamayacak kadar dar.
    // (Geniş hâli tüm sol üstü not rengine boyuyordu.)
    const glow = ctx.createRadialGradient(W * 0.13, 200, 0, W * 0.13, 200, 260);
    glow.addColorStop(0, gHex + "30"); glow.addColorStop(1, gHex + "00");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const glow2 = ctx.createRadialGradient(W * 0.95, H * 0.1, 0, W * 0.95, H * 0.1, 300);
    glow2.addColorStop(0, "#FFB11B22"); glow2.addColorStop(1, "#FFB11B00");
    ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

    // Nokta matrisi (.g-dotgrid)
    ctx.fillStyle = "rgba(255,255,255,.045)";
    for (let x = 14; x < W; x += 17) for (let y = 14; y < H; y += 17) ctx.fillRect(x, y, 1, 1);

    // Holo şeritler (.g-holo) — çok düşük opaklık, 72°
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = "#FFB11B"; ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 26) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H * 0.32, H); ctx.stroke();
    }
    ctx.restore();

    // Çerçeve + üst accent şeridi
    ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.fillStyle = "#FFB11B"; ctx.fillRect(0, 0, W, 3);

    // ── Üst bar: logo + isim | era ──
    drawMark(ctx, P + 13, P + 8, 30);
    font(700, 23); ctx.fillStyle = "#FFB11B";
    ctx.fillText("PRIMARY ARCH", P + 36, P + 16);
    body(400, 12); ctx.fillStyle = TXT.faint;
    ctx.fillText("Lineup Builder", P + 36, P + 33);

    if (simEraLabel) {
      font(700, 13); ctx.textAlign = "right";
      const tw = ctx.measureText(simEraLabel.toUpperCase()).width;
      ctx.fillStyle = "rgba(255,255,255,.05)";
      ctx.beginPath(); ctx.roundRect(W - P - tw - 26, P - 2, tw + 26, 28, 14); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = TXT.muted;
      ctx.fillText(simEraLabel.toUpperCase(), W - P - 13, P + 17);
      ctx.textAlign = "left";
    }

    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P, P + 56); ctx.lineTo(W - P, P + 56); ctx.stroke();

    // ── Kahraman: not karesi + skor + üç bileşen ──
    const heroY = P + 92;
    // not karesi
    ctx.save();
    ctx.shadowColor = gHex; ctx.shadowBlur = 40;
    ctx.fillStyle = gHex + "1f";
    ctx.beginPath(); ctx.roundRect(P, heroY, 108, 108, 26); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = gHex + "66"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(P, heroY, 108, 108, 26); ctx.stroke();
    font(700, 66); ctx.fillStyle = gHex; ctx.textAlign = "center";
    ctx.fillText(grade, P + 54, heroY + 76);
    ctx.textAlign = "left";

    // skor
    font(700, 76); ctx.fillStyle = TXT.primary;
    ctx.fillText(String(pct), P + 132, heroY + 68);
    const pw = ctx.measureText(String(pct)).width;
    font(500, 22); ctx.fillStyle = TXT.faint;
    ctx.fillText("/ 100", P + 140 + pw, heroY + 68);
    body(500, 11); ctx.fillStyle = TXT.muted;
    ctx.fillText("LINEUP FIT", P + 134, heroY + 92);

    // üç bileşen — sağ blok
    const parts = [
      ["QUALITY", Math.round((fit.avgQuality || 0) * 100), "45%"],
      ["COVERAGE", Math.round((fit.coverage || 0) * 100), "40%"],
      ["ROLE FIT", Math.round((fit.roleFit || 0) * 100), "15%"],
    ];
    parts.forEach(([label, v, w], i) => {
      const x = W - P - (2 - i) * 132 - 96;
      font(700, 40); ctx.fillStyle = vHex(v / 100);
      ctx.fillText(String(v), x, heroY + 52);
      body(500, 10.5); ctx.fillStyle = TXT.muted;
      ctx.fillText(label, x, heroY + 72);
      body(400, 9); ctx.fillStyle = TXT.faint;
      ctx.fillText("weight " + w, x, heroY + 87);
    });

    // ── Kadro: iki sütun ──
    const rosterY = heroY + 150;
    body(700, 10); ctx.fillStyle = TXT.faint;
    ctx.fillText("STARTERS", P, rosterY);
    ctx.fillText("ROTATION", W / 2 + 12, rosterY);

    const drawPlayer = (p, slot, x, y, isBench) => {
      if (!p) return;
      const hex = isBench ? "#6b7280" : (PH[slot] || "#9ca3af");
      const pf = computePlayerFit(p, simEraObj);
      const q = Math.round(pf.quality * 100);
      // mevki rozeti
      ctx.fillStyle = hex + "1f";
      ctx.beginPath(); ctx.roundRect(x, y - 15, 30, 22, 7); ctx.fill();
      ctx.strokeStyle = hex + "55"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y - 15, 30, 22, 7); ctx.stroke();
      font(700, 11); ctx.fillStyle = hex; ctx.textAlign = "center";
      ctx.fillText(isBench ? "BN" : slot, x + 15, y + 0.5);
      ctx.textAlign = "left";
      // isim + arketip
      body(600, 14); ctx.fillStyle = isBench ? TXT.muted : TXT.primary;
      const name = p.PLAYER_NAME || "—";
      ctx.fillText(name.length > 20 ? name.split(" ").slice(-1)[0] : name, x + 40, y + 1);
      body(400, 10.5); ctx.fillStyle = "#60a5fa";
      ctx.fillText(p.primary_arch || "—", x + 40, y + 15);
      // era etkisi
      if (pf.dist > 0 && !pf.timeless) {
        const aw = ctx.measureText(p.primary_arch || "—").width;
        body(400, 10); ctx.fillStyle = TXT.faint;
        ctx.fillText(`· −${pf.dist} era`, x + 46 + aw, y + 15);
      }
      // kalite
      font(700, 19); ctx.fillStyle = isBench ? TXT.muted : vHex(q / 100);
      ctx.textAlign = "right";
      ctx.fillText(String(q), x + 480, y + 2);
      ctx.textAlign = "left";
    };

    POSITIONS.forEach((slot, i) => drawPlayer(lineup[slot], slot, P, rosterY + 32 + i * 34, false));
    BENCH_SLOTS.forEach((slot, i) => drawPlayer(lineup[slot], slot, W / 2 + 12, rosterY + 32 + i * 34, true));

    // ── Beş sütun ──
    const pillY = rosterY + 222;
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P, pillY - 26); ctx.lineTo(W - P, pillY - 26); ctx.stroke();

    const pillars = [
      ["CREATION", fit.creation], ["SPACING", fit.spacing],
      ["RIM PROT", fit.rim_protection], ["PERIM D", fit.perimeter_d],
      ["FINISHING", fit.finishing],
    ];
    const colW = (W - P * 2) / 5;
    pillars.forEach(([label, val], i) => {
      const x = P + i * colW, v = Math.round((val || 0) * 100);
      body(600, 9.5); ctx.fillStyle = TXT.faint;
      ctx.fillText(label, x, pillY);
      // bar
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.beginPath(); ctx.roundRect(x, pillY + 10, colW - 26, 8, 4); ctx.fill();
      ctx.fillStyle = vHex(v / 100);
      ctx.beginPath(); ctx.roundRect(x, pillY + 10, (colW - 26) * (v / 100), 8, 4); ctx.fill();
      font(700, 17); ctx.fillStyle = vHex(v / 100);
      ctx.fillText(String(v), x, pillY + 40);
    });

    // ── Alt bar: koç solda, imza sağ altta ──
    const footY = H - P + 6;
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P, footY - 34); ctx.lineTo(W - P, footY - 34); ctx.stroke();

    if (coachName) {
      body(400, 11.5); ctx.fillStyle = TXT.muted;
      ctx.fillText(`Coach ${coachName}`, P, footY - 8);
    }

    // İmza — logo + isim + adres, sağ alt
    drawMark(ctx, W - P - 122, footY - 14, 26);
    ctx.textAlign = "left";
    font(700, 16); ctx.fillStyle = "#FFB11B";
    ctx.fillText("PRIMARY ARCH", W - P - 104, footY - 15);
    body(400, 10); ctx.fillStyle = TXT.faint;
    ctx.fillText(SITE_URL.replace(/^https?:\/\//, ""), W - P - 104, footY - 2);

    return canvas;
  };


  // Canvas, sayfanın webfont'ları (Rajdhani/Outfit) inmeden çizilirse sessizce
  // sistem fontuna düşer ve kart "yanlış" görünür — önce fontları bekle.
  const generate = async () => {
    await document.fonts?.ready;
    setPreview(buildCanvas().toDataURL("image/png"));
  };

  const download = async () => {
    await document.fonts?.ready;
    const a = document.createElement("a");
    a.download = `primary-arch-lineup-${pct}-${Date.now()}.png`;
    a.href = buildCanvas().toDataURL("image/png");
    a.click();
  };

  const tweet = () => {
    const text = `I scored ${pct}/100 (${grade}) on Primary Arch Lineup Builder!\n\nBuild your all-time lineup across eras 🏀\n${SITE_URL}/game\n\n#PrimaryArch #NBA`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${SITE_URL}/game`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="g-panel p-4 space-y-3">
      <div className="g-label">Share Your Result</div>

      {/* Preview */}
      {preview ? (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.1)" }}>
          <img src={preview} alt="score card" className="w-full" />
        </div>
      ) : (
        <button onClick={generate} className="aura-pill-btn w-full justify-center" style={{ padding: "10px" }}>
          <EyeIcon size={15} /> Preview Card
        </button>
      )}

      {/* Butonlar */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { onClick: download, icon: <DownloadIcon size={13} />, label: "Save PNG", color: "#9ca3af" },
          { onClick: tweet,    icon: <XLogoIcon size={12} />,    label: "Tweet",    color: "#60a5fa" },
          { onClick: copyLink, icon: copied ? <CheckIcon size={13} /> : <LinkIcon size={13} />, label: copied ? "Copied!" : "Copy Link", color: copied ? "#4ade80" : "#9ca3af" },
        ].map(({ onClick, icon, label, color }) => (
          <button key={label} onClick={onClick}
            className="py-2 rounded-xl text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5"
            style={{ color, background: color + "12", border: `1px solid ${color}33` }}
            onMouseEnter={e => { e.currentTarget.style.background = color + "22"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = color + "12"; e.currentTarget.style.transform = "none"; }}>
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function LineupGame() {
  const { lang } = useLang();

  // Oyun fazı
  const [phase, setPhase] = useState("idle");
  // idle | pick_era | spin_season | spin_team | fetching | pick_player | pick_pos | pick_coach | complete

  // Simülasyon era'sı (v3.5): sezon simülasyonunun oynanacağı dönem
  const [simEra, setSimEra] = useState(null);

  // Oyun modu (Faz 3b): classic | salarycap
  const [mode, setMode] = useState("classic");
  const modeRef = useRef("classic");
  useEffect(()=>{ modeRef.current = mode; },[mode]);
  const guaranteeRef = useRef(0);    // salary cap: art arda kaç spin'de seçilebilir tier çıkmadı
  const wildcardRef  = useRef(false); // 15 denemede tier bulunamadı → herkes seçilebilir
  const startSpinRef = useRef(null);  // fetchPlayers → startFullSpin döngüsel referansı

  // Koç draft'ı (Faz 2)
  const [coach, setCoach]               = useState(null);
  const [coachOptions, setCoachOptions] = useState([]);

  // Veriler
  const [seasons, setSeasons]       = useState([]);
  const [teamPool, setTeamPool]     = useState([]);
  const [players, setPlayers]       = useState([]);
  const [lineup, setLineup]         = useState({PG:null,SG:null,SF:null,PF:null,C:null,B1:null,B2:null,B3:null,B4:null});
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const [fitResult, setFitResult]   = useState(null);
  const [statusMsg, setStatusMsg]   = useState("");
  const [moveSrc, setMoveSrc]       = useState(null); // saha üzerinde taşınan slot
  const [posFilter, setPosFilter]   = useState("");   // pick listesi G/F/C filtresi
  const [sortKey, setSortKey]       = useState("PTS"); // pick listesi sıralaması

  // Çark
  const [spinSeasons, setSpinS] = useState(false);
  const [spinTeams,   setSpinT] = useState(false);
  const [targetSIdx,  setTargetSIdx] = useState(0);
  const [targetTIdx,  setTargetTIdx] = useState(0);
  const [chosenSeason, setChosenSeason] = useState("");
  const [chosenTeam,   setChosenTeam]   = useState("");

  // Jokerler
  const [jokers, setJokers] = useState({reTeam:true,reYear:true,reBoth:true,double:true,discover:true});
  const [doubleActive, setDoubleActive]   = useState(false);
  const [discoverActive, setDiscoverActive] = useState(false);
  // Info modals
  const [modal, setModal] = useState(null); // "chemistry" | "jokers" | "archetype" | "tags"
  const [eraInfo, setEraInfo] = useState(null); // era bilgi pop-up'ı (ⓘ düğmesi)

  const lineupRef = useRef(lineup);
  useEffect(()=>{ lineupRef.current=lineup; },[lineup]);
  const timerRef = useRef(null);

  const filledSlots = ALL_SLOTS.filter(p=>lineup[p]!==null);
  const emptySlots  = ALL_SLOTS.filter(p=>lineup[p]===null);
  // Kimya: mevcut dizilime göre türetilir (taşıma/swap sonrası güncel kalır)
  const primaryCount = POSITIONS.filter(p=>lineup[p]&&getPrimaryPos(lineup[p])===p).length;

  // ── Saha üzerinde taşı / takas et ─────────────────────────────────────────
  const canRearrange = ["spin_season","spin_team","fetching","pick_player","pick_coach"].includes(phase);
  const handleSlotTap = useCallback((slot)=>{
    const cur = lineupRef.current;
    if(moveSrc==null){
      if(cur[slot]) setMoveSrc(slot);
      return;
    }
    if(moveSrc===slot){ setMoveSrc(null); return; }
    const place=(pl,s)=>pl?{...pl,_assignedPos:s,_isBench:!POSITIONS.includes(s),
                            _posPenalty:posPenaltyFor(pl,s),
                            _isPrimary:POSITIONS.includes(s)&&getPrimaryPos(pl)===s}:null;
    const nl={...cur,[slot]:place(cur[moveSrc],slot),[moveSrc]:place(cur[slot],moveSrc)};
    setLineup(nl);
    lineupRef.current=nl;
    setMoveSrc(null);
  },[moveSrc]);

  const [affinityMatrix, setAffinityMatrix] = useState(null);

  useEffect(()=>{
    fetch("/api/game/seasons").then(r=>r.json()).then(d=>setSeasons(d.seasons||["2025-26"])).catch(()=>setSeasons(["2025-26"]));
    fetch("/api/affinity").then(r=>r.json()).then(d=>setAffinityMatrix(d.matrix||null)).catch(()=>{});
  },[]);

  // ── Oyuncu çek (ortak) ───────────────────────────────────────────────────
  const fetchPlayers = useCallback((season, team, onEmpty) => {
    setPhase("fetching");
    setStatusMsg("Loading players...");
    fetch(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)
      .then(r=>r.json())
      .then(d=>{
        const taken=Object.values(lineupRef.current).filter(Boolean).map(x=>x.PLAYER_NAME);
        let list=(d.players||[]).filter(p=>!taken.includes(p.PLAYER_NAME));
        if(list.length===0){ onEmpty(); return; }

        // Takım içi fiyatlama: rosterın en iyi 3'üne yıldız primi tabanı
        if(modeRef.current==="salarycap") list = applyTeamPricing(list);

        // Salary Cap garantisi: rosterda kalan bütçeyle alınabilir oyuncu olmalı
        // (kalan her slota %4 rezerv bırakarak). Yoksa otomatik yeniden çevir
        // (15 denemeden sonra wildcard: rezerv şartı kalkar).
        if(modeRef.current==="salarycap" && !wildcardRef.current){
          const lu=Object.values(lineupRef.current);
          const budgetLeft=START_BUDGET-totalSpent(lu);
          const slotsLeft=ALL_SLOTS.length-lu.filter(Boolean).length;
          const cap=maxSpendNow(budgetLeft, slotsLeft);
          const pickable=list.some(p=>priceOf(p)<=cap);
          if(!pickable){
            guaranteeRef.current++;
            if(guaranteeRef.current>=15){
              wildcardRef.current=true;
              setStatusMsg("Tier hunt exhausted — wildcard round: anyone is pickable");
            } else {
              setStatusMsg(`No open-tier players on this roster — respinning (${guaranteeRef.current})...`);
              setTimeout(()=>startSpinRef.current&&startSpinRef.current(),650);
              return;
            }
          } else {
            guaranteeRef.current=0;
          }
        }

        setPlayers(list);
        setPosFilter("");
        setPhase("pick_player");
        if(!wildcardRef.current) setStatusMsg("");
      })
      .catch(()=>{ setStatusMsg("API error"); setPhase("idle"); });
  },[lang]);

  // ── TAM SPIN: sezon → takım → oyuncular ──────────────────────────────────
  // ÖNEMLİ: fixed* ("değer önceden belli") ile spin* ("o çark dönsün mü")
  // AYRI kavramlar. Eskiden tek parametre ikisini birden ifade ediyordu ve
  // Year jokeri ters çalışıyordu: yeniden yuvarlanan SEZON hiç dönmeden
  // beliriyor, korunan TAKIM ise boşuna 2sn dönüyordu.
  const startFullSpin = useCallback((fixedSeason=null, fixedTeam=null, opts={}) => {
    if(seasons.length===0) return;
    clearTimeout(timerRef.current);

    const spinSeason = opts.spinSeason ?? !fixedSeason;
    const spinTeam   = opts.spinTeam   ?? true;

    const sIdx = fixedSeason ? seasons.indexOf(fixedSeason) : Math.floor(Math.random()*seasons.length);
    setTargetSIdx(Math.max(0,sIdx));
    setSpinS(spinSeason);
    setSpinT(false);
    setPlayers([]);
    setPhase(spinSeason?"spin_season":"spin_team");
    setStatusMsg("");

    const afterSeasonStop = (season) => {
      setChosenSeason(season);
      setStatusMsg("Loading teams...");

      fetch(`/api/game/teams?season=${encodeURIComponent(season)}`)
        .then(r=>r.json())
        .then(d=>{
          const teams=d.teams||[];
          if(teams.length===0){ startFullSpin(); return; }
          setTeamPool(teams);

          // Sabit takım varsa onu seç, yoksa rastgele
          let tIdx;
          if(fixedTeam){
            const fi=teams.indexOf(fixedTeam);
            tIdx=fi>=0?fi:Math.floor(Math.random()*teams.length);
          } else {
            tIdx=Math.floor(Math.random()*teams.length);
          }
          setTargetTIdx(tIdx);
          setSpinT(spinTeam);
          setPhase("spin_team");
          setStatusMsg("");

          // Takım korunuyorsa çarkı döndürmenin anlamı yok — kısa bir
          // yerleşme payı bırakıp doğrudan rostere geç.
          timerRef.current=setTimeout(()=>{
            const team=teams[tIdx];
            setSpinT(false);
            setChosenTeam(team);
            fetchPlayers(season, team, ()=>{
              setStatusMsg("No data, re-spinning...");
              setTimeout(()=>startFullSpin(),700);
            });
          }, spinTeam ? 1600 : 250);
        })
        .catch(()=>startFullSpin());
    };

    const landedSeason = fixedSeason || seasons[Math.max(0,sIdx)];
    if(spinSeason){
      timerRef.current=setTimeout(()=>{
        setSpinS(false);
        afterSeasonStop(landedSeason);
      },1600);
    } else {
      afterSeasonStop(landedSeason);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[seasons, lang, fetchPlayers]);

  // fetchPlayers içindeki otomatik respin için güncel referans
  useEffect(()=>{ startSpinRef.current = startFullSpin; },[startFullSpin]);

  // ── Joker: sadece takım çevir (mevcut takım hariç) ───────────────────────
  const jokerReTeam = useCallback(()=>{
    if(!jokers.reTeam||teamPool.length===0) return;
    setJokers(j=>({...j,reTeam:false}));
    clearTimeout(timerRef.current);
    // Mevcut takımı havuzdan çıkar
    const otherTeams = teamPool.filter(t => t !== chosenTeam);
    const pool = otherTeams.length > 0 ? otherTeams : teamPool;
    const tIdx = teamPool.indexOf(pool[Math.floor(Math.random()*pool.length)]);
    setTargetTIdx(Math.max(0,tIdx));
    setSpinT(true);
    setSpinS(false);
    setPlayers([]);
    setPhase("spin_team");

    timerRef.current=setTimeout(()=>{
      const team=teamPool[Math.max(0,tIdx)];
      setSpinT(false);
      setChosenTeam(team);
      fetchPlayers(chosenSeason,team,()=>{
        // hâlâ boş ise tekrar dene
        const alt=pool.filter(t=>t!==team);
        if(alt.length===0) return;
        const ai=teamPool.indexOf(alt[Math.floor(Math.random()*alt.length)]);
        setTargetTIdx(Math.max(0,ai));
        setSpinT(true);
        timerRef.current=setTimeout(()=>{
          const t2=teamPool[Math.max(0,ai)];
          setSpinT(false);
          setChosenTeam(t2);
          fetchPlayers(chosenSeason,t2,()=>{});
        },2000);
      });
    },2000);
  },[jokers.reTeam,teamPool,chosenTeam,chosenSeason,fetchPlayers]);

  // ── Joker: sadece yılı çevir (mevcut sezon hariç) ────────────────────────
  const jokerReYear = useCallback(()=>{
    if(!jokers.reYear||seasons.length===0) return;
    setJokers(j=>({...j,reYear:false}));
    const otherSeasons = seasons.filter(s => s !== chosenSeason);
    const pool = otherSeasons.length > 0 ? otherSeasons : seasons;
    const picked = pool[Math.floor(Math.random()*pool.length)];
    // Sezon yeniden yuvarlanıyor → SEZON çarkı dönsün; takım korunuyor →
    // takım çarkı dönmesin.
    startFullSpin(picked, chosenTeam, { spinSeason:true, spinTeam:false });
  },[jokers.reYear,seasons,chosenSeason,chosenTeam,startFullSpin]);

  // ── Joker: ikisini de çevir (mevcut sezon+takım kombinasyonu hariç) ──────
  const jokerReBoth = useCallback(()=>{
    if(!jokers.reBoth) return;
    setJokers(j=>({...j,reBoth:false}));
    // startFullSpin tamamen rastgele — sadece aynı sezonu almamaya çalış
    const otherSeasons = seasons.filter(s => s !== chosenSeason);
    const pool = otherSeasons.length > 0 ? otherSeasons : seasons;
    const picked = pool[Math.floor(Math.random()*pool.length)];
    // İkisi de yeniden yuvarlanıyor → her iki çark da dönsün.
    startFullSpin(picked, null, { spinSeason:true, spinTeam:true });
  },[jokers.reBoth,seasons,chosenSeason,startFullSpin]);

  // ── Joker: ikili seçim ────────────────────────────────────────────────────
  const jokerDouble = useCallback(()=>{
    if(!jokers.double) return;
    setJokers(j=>({...j,double:false}));
    setDoubleActive(true);
  },[jokers.double]);

  // ── Joker: discover (arketip + skor göster) ───────────────────────────────
  const jokerDiscover = useCallback(()=>{
    if(!jokers.discover) return;
    setJokers(j=>({...j,discover:false}));
    setDiscoverActive(true);
  },[jokers.discover]);

  // ── Oyuncu seç ────────────────────────────────────────────────────────────
  const handlePickPlayer = (player) => {
    let enrichedPick = player;
    // Salary Cap: bütçeyi aşan sözleşme alınamaz (wildcard'da rezerv şartı düşer)
    if(mode==="salarycap"){
      const c=priceOf(player);
      const lu=Object.values(lineupRef.current);
      const budgetLeft=START_BUDGET-totalSpent(lu);
      const slotsLeft=ALL_SLOTS.length-lu.filter(Boolean).length;
      const cap=wildcardRef.current ? budgetLeft : maxSpendNow(budgetLeft, slotsLeft);
      if(c>cap) return; // kart zaten disabled — guard
      enrichedPick={...player,_cost:c};
    }
    setPickedPlayer(enrichedPick);
    setDiscoverActive(false);
    setStatusMsg("");
    setPhase("pick_pos");
  };

  // ── Pozisyon seç (starter mevkisi veya bench slotu) ──────────────────────
  const handlePickPos = (pos) => {
    const isStarter = POSITIONS.includes(pos);
    const isPrimary = isStarter && getPrimaryPos(pickedPlayer) === pos;

    const enriched={...pickedPlayer,_season:chosenSeason,_team:chosenTeam,_isPrimary:isPrimary,
                    _assignedPos:pos,_isBench:!isStarter,
                    _posPenalty:posPenaltyFor(pickedPlayer,pos)};
    const newLineup={...lineupRef.current,[pos]:enriched};
    setLineup(newLineup);
    lineupRef.current=newLineup;
    setPickedPlayer(null);

    const filled=ALL_SLOTS.filter(p=>newLineup[p]!==null);
    if(filled.length===ALL_SLOTS.length){
      // Koç draft'ı: 4 rastgele aday. Fit, koç seçilirken hesaplanır
      // (pick_coach sırasında dizilim hâlâ değiştirilebilir).
      setCoachOptions([...COACHES].sort(()=>Math.random()-0.5).slice(0,4));
      setPhase("pick_coach");
    } else if(doubleActive){
      // İkili seçim: aynı havuzdan tekrar seç
      setPlayers(prev=>prev.filter(p=>p.PLAYER_NAME!==pickedPlayer.PLAYER_NAME));
      setDoubleActive(false);
      setPhase("pick_player");
    } else {
      setTimeout(()=>startFullSpin(),400);
    }
  };

  const resetGame = () => {
    clearTimeout(timerRef.current);
    const empty={PG:null,SG:null,SF:null,PF:null,C:null,B1:null,B2:null,B3:null,B4:null};
    setLineup(empty);
    lineupRef.current=empty;
    setCoach(null);
    setCoachOptions([]);
    setFitResult(null);
    setPlayers([]);
    setPickedPlayer(null);
    setChosenSeason("");
    setChosenTeam("");
    setTeamPool([]);
    setStatusMsg("");
    setSpinS(false);
    setSpinT(false);
    setMoveSrc(null);
    setJokers({reTeam:true,reYear:true,reBoth:true,double:true,discover:true});
    setDoubleActive(false);
    setDiscoverActive(false);
    setSimEra(null);
    guaranteeRef.current=0;
    wildcardRef.current=false;
    setPhase("idle");
  };

  const isSpinPhase = phase==="spin_season"||phase==="spin_team"||phase==="fetching";

  return (
    <div className="h-full overflow-y-auto">
    <SEO
      title="Lineup Builder Game"
      description="Build the greatest 5-man lineup in NBA history. Pick players from any era — 1983 to today — and see how well your roster fits together across archetypes and eras."
      path="/game/single"
    />
    <div className="p-4 sm:p-6 max-w-[1560px] mx-auto space-y-3 pb-6">

      {/* ── Tag lejantı ────────────────────────────────────────────────
          Kurallar (kimya / jokerler / arketipler) artık giriş ekranındaki
          mod kartının ⓘ pop-up'ında tek kaynaktan anlatılıyor; burada
          sadece rozetlerin okunması kalıyor, o da rozetlerin göründüğü
          yerden — havuz başlığındaki ⓘ'den — açılıyor. */}
      <InfoModal open={modal==="tags"} onClose={()=>setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-gray-300"><TagIcon size={16} /></span> Player Tag Effects</span>}>
        <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
          <p className="text-[11px] text-gray-500 leading-relaxed pb-1">
            On player rows tags show as small colored initials. Here's what each means:
          </p>
          {TAG_INFO.map(t=>(
            <div key={t.key} className="rounded-lg p-2.5 flex items-start gap-2.5"
              style={{background:t.color+"0d",borderLeft:`3px solid ${t.color}`}}>
              {/* baş harf rozeti = satırlarda göründüğü hâli */}
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center text-[10px] font-bold rounded px-1.5 h-[18px] min-w-[18px]"
                style={{color:t.color,background:t.color+"22",border:`1px solid ${t.color}66`}}>{t.abbr}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold" style={{color:t.color}}>{t.label}</div>
                <div className="text-xs text-gray-300 leading-relaxed mt-0.5">{t.desc}</div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-gray-500 italic pt-1">
            Tags come from real award history (1983+) and live archetype data.
            Click a player to see their tags full-size with effects.
          </p>
        </div>
      </InfoModal>

      {/* ── HEADER DOCK: başlık + mod anahtarı TEK barda ────────────────
          Eskiden başlık ayrı, iki büyük mod kartı ayrıydı; artık ikisi tek
          kontrol yüzeyi. Mod seçimi bir "segmented switcher" — iki kart
          birbiriyle yarışmıyor, biri açıkça aktif. */}
      {phase==="idle"&&(
        <div className="g-dock">
          <span className="aura-blob" style={{"--slot-color":"#FFB11B",left:-30,top:-70,width:240,height:150,opacity:0.16}} />
          <div className="g-dock-left">
            <h1 className="g-dock-title">Lineup Builder</h1>
            <p className="g-dock-sub">Draft 9 players · 5 starters, 4 bench · 1 coach</p>
          </div>

          <div className="g-dock-center">
            <button onClick={()=>setPhase("pick_era")} disabled={seasons.length===0}
              className="aura-rating-btn"
              style={{padding:"17px 42px",fontSize:14,letterSpacing:".14em",opacity:seasons.length===0?0.5:1}}>
              {seasons.length===0?"Loading…"
                :mode==="salarycap"?<><CapIcon size={16} /> <span className="ml-2">Start Salary Cap Draft</span></>
                :<><WheelIcon size={16} /> <span className="ml-2">Start Draft Phase</span></>}
            </button>
          </div>

          <div className="g-dock-right">
            <div className="g-seg stacked">
              {[
                {key:"classic",   Icon:WheelIcon, hex:"#60a5fa", label:"Classic",    hint:"Pure luck"},
                {key:"salarycap", Icon:CapIcon,   hex:"#FFB11B", label:"Salary Cap", hint:"100% cap"},
              ].map(({key,Icon,hex,label,hint})=>(
                <button key={key} onClick={()=>setMode(key)}
                  className={`g-seg-btn${mode===key?" on":""}`}
                  style={{"--accent":hex,"--accent-a":hex+"22","--accent-line":hex+"66"}}>
                  <Icon size={14} /> {label}
                  <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── İNCE DOCK: oyun boyunca üstte kalır ─────────────────────────
          Sol: koşu durumu (era + ilerleme). Orta: spin dönerken çark,
          durduğunda jokerler. Sağ: düşen takım/yıl — kutusuz, düz yazı.
          Böylece spin/joker/takım hepsi dock'ta halloluyor ve alttaki iki
          panel tüm genişliği oyuncu havuzuna + korta bırakıyor. */}
      {phase!=="idle"&&phase!=="complete"&&(
        <div className="g-dock thin">
          <span className="aura-blob" style={{"--slot-color":"#FFB11B",left:-30,top:-60,width:220,height:130,opacity:isSpinPhase?0.24:0.12,transition:"opacity .4s ease"}} />

          {/* SOL — koşu durumu */}
          <div className="g-dock-left flex items-center gap-3">
            <h1 className="g-dock-title">Lineup Builder</h1>
            {simEra&&(
              <span className="g-status" title={`Season simulates in the ${simEra.label}`}
                style={{"--accent":ERA_HEX[simEra.id]||"#9ca3af","--accent-a":(ERA_HEX[simEra.id]||"#9ca3af")+"1f","--accent-line":(ERA_HEX[simEra.id]||"#9ca3af")+"55"}}>
                {simEra.short}
              </span>
            )}
            {phase!=="pick_era"&&(
              <div className="flex items-center gap-2 min-w-[110px]">
                <div className="g-progress"><div style={{width:`${(filledSlots.length/ALL_SLOTS.length)*100}%`}}/></div>
                <span className="text-[10.5px] tabular-nums shrink-0" style={{color:"var(--text-muted)"}}>{filledSlots.length}/{ALL_SLOTS.length}</span>
                {primaryCount>0&&<span className="text-[10.5px] inline-flex items-center gap-0.5 shrink-0" style={{color:"var(--yamabuki)"}}><StarIcon size={10} />×{primaryCount}</span>}
              </div>
            )}
          </div>

          {/* ORTA — spin dönerken çark, sonra jokerler */}
          <div className="g-dock-center">
            {isSpinPhase ? (
              <div className="flex items-center gap-7">
                <InlineSpin items={seasons} spinning={spinSeasons} targetIdx={targetSIdx}
                  label={lang==="tr"?"Sezon":"Season"} accent="#FFB11B" />
                <InlineSpin items={teamPool.length>0?teamPool:["…"]} spinning={spinTeams} targetIdx={targetTIdx}
                  label={lang==="tr"?"Takım":"Team"} accent="#60a5fa" />
              </div>
            ) : phase==="pick_player" ? (
              <div className="flex gap-1.5 justify-center">
                <JokerBtn Icon={RefreshIcon}  label="Team"     available={jokers.reTeam}   onClick={jokerReTeam}/>
                <JokerBtn Icon={CalendarIcon} label="Year"     available={jokers.reYear}   onClick={jokerReYear}/>
                <JokerBtn Icon={BoltIcon}     label="Both"     available={jokers.reBoth}   onClick={jokerReBoth}/>
                <JokerBtn Icon={UsersIcon}    label="Pick 2"   available={jokers.double&&!doubleActive&&emptySlots.length>=2} onClick={jokerDouble}/>
                <JokerBtn Icon={SearchIcon}   label="Discover" available={jokers.discover&&!discoverActive} onClick={jokerDiscover}/>
              </div>
            ) : null}
          </div>

          {/* SAĞ — düşen takım / yıl, kutusuz düz yazı */}
          <div className="g-dock-right">
            {chosenTeam&&!isSpinPhase ? (
              <div className="g-dock-team">
                <div className="tm">{chosenTeam}</div>
                <div className="yr">{chosenSeason}</div>
              </div>
            ) : mode==="salarycap"&&phase!=="pick_era" ? (
              <div className="g-dock-team">
                <div className="tm" style={{fontSize:17}}>{START_BUDGET-totalSpent(Object.values(lineup))}%</div>
                <div className="yr">cap left</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Joker durum satırı — dock'un altında ince bir bilgi şeridi */}
      {phase==="pick_player"&&(doubleActive||discoverActive)&&(
        <div className="flex justify-center gap-4 text-xs">
          {doubleActive&&(
            <span className="inline-flex items-center gap-1.5 animate-pulse" style={{color:"var(--yamabuki)"}}>
              <UsersIcon size={13} /> Double pick active — choose 2 players
            </span>
          )}
          {discoverActive&&(
            <span className="inline-flex items-center gap-1.5 animate-pulse" style={{color:"#4ade80"}}>
              <SearchIcon size={13} /> Discover active — hidden overalls revealed
            </span>
          )}
        </div>
      )}

      {/* === IDLE: 3-sütun HUD — bağlam | kort | analitik === */}
      {phase==="idle"&&(
        <div className="g-hud">

          {/* ── SOL: draft süreci (numaralı akış — sıra gerçekten anlamlı) ── */}
          <div className="col-side min-w-0">
            <HowItWorksPanel label="Draft Process" fill steps={[
              ["1",TargetIcon,"","Pick Era","Distance & style fit",
                "Your whole run is simulated inside one era. Every player's power scales with how far their real prime sits from it — one era off costs about 3%, five eras about 22%. But an archetype the era loves travels one era closer, and one it has no use for travels one further. A season's top-2 players are TIMELESS and ignore distance entirely.",
                <>Pick <b>Small Ball</b> and a 1995 Spacer plays nearly at full strength, because that era pays for shooting. The same era guts a back-to-the-basket Force.</>],
              ["2",WheelIcon,"","Spin & Draft 9","5 starters + 4 bench",
                "Each round two wheels land on a random season and a random team, and you draft one player off that exact roster. Overall ratings stay hidden — you see the archetype, the box score and the tags, and you judge from those. Five jokers let you bend the wheel when it betrays you.",
                <>Wheel lands on <b>2015-16 GSW</b>. You can take Curry as your Spacer, or grab Draymond because your lineup has no Anchor yet.</>],
              ["3",CoachIcon,"","Hire Coach","Offense & Defense grades",
                "After the roster is full you choose from four coaches. Their Offense and Defense grades shift your team rating all season long, and championship rings add playoff DNA — the more rings, the bigger the boost once the postseason lights come on.",
                <>An <b>A-grade defensive coach with 3 rings</b> lifts a mediocre defense into contention and adds a real edge in a Game 7.</>],
              ["4",TrophyIcon,"","Simulate 82","Playoffs & awards glory",
                "Your nine players and coach run a full 82-game regular season, then the playoffs. The sim produces standings, awards, All-Star nods, a champion — and your final Lineup Fit grade, which is what lands on the leaderboard.",
                <>A balanced roster can win 58 games; stacking three ball-dominant Engines wins fewer despite better raw talent — <b>role redundancy</b> is a real penalty.</>],
            ]} />
          </div>

          {/* ── ORTA: kort matrisi — ekranın ağırlık merkezi ── */}
          <div className="col-court min-w-0">
            <div className="g-court-panel">
              <div className="g-dotgrid" />
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="g-mono" style={{color:"var(--yamabuki)"}}>// Court Matrix</span>
                <span className="g-status" style={{"--accent":"#9ca3af","--accent-a":"rgba(156,163,175,.12)","--accent-line":"rgba(156,163,175,.35)"}}>
                  Status: Awaiting Draft
                </span>
              </div>
              <div className="pointer-events-none">
                <CourtBoard lineup={lineup} coach={null} moveSrc={null} canRearrange={false}
                  onSlotTap={()=>{}} getPrimaryPos={getPrimaryPos} placing={false}
                  placingEligible={[]} placingPenalties={{}} onPlace={()=>{}} bare/>
              </div>
            </div>
          </div>

          {/* ── SAĞ: canlı leaderboard ──────────────────────────────────────
              Burada eskiden "How Scoring Works" vardı; skorlama artık giriş
              ekranındaki mod kartının ⓘ pop-up'ında tek kaynaktan
              anlatılıyor. Bu alan artık kovalanacak sayıyı gösteriyor. */}
          <div className="col-side min-w-0">
            <LeaderboardPanel mode={mode} limit={25} fill />
          </div>

        </div>
      )}


      {phase!=="idle"&&phase!=="complete"&&(
      // Havuz sabit-ish genişlikte (satır içeriği ~600px'te bitiyor, fazlası
      // ölü alan olurdu); kalan tüm genişlik korta gider — kort dar kalınca
      // saha çizimi sıkışıyordu.
      // items-stretch: iki sütun aynı satır yüksekliğini paylaşır, böylece
      // havuz kutusunun ALT hattı her modda kortunkiyle hizalı kalır.
      <div className="grid grid-cols-1 lg:grid-cols-[clamp(560px,45%,640px)_minmax(0,1fr)] gap-4 items-stretch">

      {/* ── SOL PANEL: oyuncu havuzu ── */}
      <div className="min-w-0 flex flex-col gap-3">

      {/* Lineup bar (mobil) — desktop'ta sağdaki saha görünümü kullanılır */}
      <div className="flex gap-1 lg:hidden">
        {POSITIONS.map(pos=><LineupSlot key={pos} pos={pos} player={lineup[pos]}
          selected={moveSrc===pos} canTap={canRearrange} onTap={handleSlotTap}/>)}
      </div>
      <div className="flex gap-1 opacity-80 lg:hidden">
        {BENCH_SLOTS.map(pos=><LineupSlot key={pos} pos={pos} player={lineup[pos]} bench
          selected={moveSrc===pos} canTap={canRearrange} onTap={handleSlotTap}/>)}
      </div>
      {canRearrange&&moveSrc&&(
        <p className="text-[9.5px] text-yamabuki/90 lg:hidden">Moving {lineup[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}

      {/* Salary Cap: dock'ta kalan yüzde var; burada sadece bu el için tavan */}
      {mode==="salarycap"&&phase==="pick_player"&&(()=>{
        const budgetLeft=START_BUDGET-totalSpent(Object.values(lineup));
        const slotsLeft=emptySlots.length;
        const cap=Math.max(0, maxSpendNow(budgetLeft, slotsLeft));
        const hex=budgetLeft<=15?"#f87171":budgetLeft<=35?"#FFB11B":"#4ade80";
        return (
          <div className="flex items-center gap-3">
            <span className="g-label shrink-0"><CapIcon size={12} /> Cap</span>
            <div className="g-bar-track flex-1" style={{height:8}}>
              <div className="g-bar-fill" style={{width:`${budgetLeft}%`,"--fill":hex,"--fill-a":hex+"66"}}/>
            </div>
            {slotsLeft>0&&(
              <span className="text-[10px] shrink-0" style={{color:"var(--text-muted)"}}>
                max <b style={{color:hex}}>{cap}%</b> this pick · {slotsLeft} left
              </span>
            )}
          </div>
        );
      })()}

      {/* === IDLE === */}
      {/* === PICK SIM ERA === */}
      {phase==="pick_era"&&(
        // flex-1: panel sol sütunun kalanını doldurur → alt hattı kortla
        // hizalanır ve kort iki fazda da aynı boyutta kalır.
        <div className="g-panel p-5 flex flex-col gap-3 flex-1 min-h-0">
          <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: "20%", top: -50, width: 260, height: 140, opacity: 0.16 }} />
          <div className="shrink-0">
            <div className="g-label mb-2">Step 1 — Pick Your Simulation Era</div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Your whole run lives in this era. Every player's power scales with distance from
              their home decade (one era off ≈ −3%, five eras ≈ −22%) — but an archetype the era
              loves travels one era closer, one it dumps travels one further. TIMELESS greats
              (a season's top 2) ignore distance entirely.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1 min-h-0" style={{gridAutoRows:"1fr"}}>
            {ERAS.map(era=>{
              const eHex = ERA_HEX[era.id] || "#9ca3af";
              return (
                <div key={era.id} className="g-tile"
                  onClick={()=>{setSimEra(era);startFullSpin();}}
                  style={{"--accent":eHex,"--accent-a":eHex+"1a","--accent-line":eHex+"55"}}>
                  <span className="aura-blob" style={{"--slot-color":eHex,right:-24,top:-24,width:120,height:88,opacity:0.26}} />
                  {/* Bilgi düğmesi — seçim tıklamasını tetiklemez */}
                  <button className="g-tile-info" title={`About the ${era.label}`}
                    onClick={(e)=>{e.stopPropagation();setEraInfo(era);}}>
                    <InfoIcon size={12} />
                  </button>
                  <div className="g-tile-title" style={{color:eHex,paddingRight:30}}>{era.label}</div>
                  <div className="g-tile-sub">{era.years[0]}–{Math.min(era.years[1],2026)}</div>
                  <div className="g-tile-desc" style={{fontSize:10,marginTop:6}}>{ERA_META_BLURB[era.id]}</div>
                </div>
              );
            })}
          </div>
          <button
            onClick={()=>{setSimEra(ERAS[Math.floor(Math.random()*ERAS.length)]);startFullSpin();}}
            className="aura-pill-btn w-full justify-center shrink-0" style={{padding:"10px"}}>
            <DiceIcon size={15} /> Random Era
          </button>
        </div>
      )}

      {/* Era bilgi pop-up'ı — Glossary'nin ERA_GUIDE'ından beslenir (tek kaynak) */}
      {eraInfo&&(()=>{
        const g = ERA_GUIDE.find(x=>x.short===eraInfo.short);
        const eHex = ERA_HEX[eraInfo.id] || "#9ca3af";
        return (
          <InfoModal open onClose={()=>setEraInfo(null)} accent={eHex}
            title={<span style={{color:eHex}}>{eraInfo.label}</span>}>
            <div className="space-y-3">
              <div className="g-mono" style={{color:"var(--text-faint)"}}>
                {eraInfo.years[0]}–{Math.min(eraInfo.years[1],2026)}
              </div>
              {g?.meta&&<p className="text-[13px] italic" style={{color:eHex}}>{g.meta}</p>}
              <p className="text-[13px] leading-relaxed" style={{color:"var(--text-muted)"}}>
                {g?.desc||ERA_META_BLURB[eraInfo.id]}
              </p>
              {g&&(
                <div className="pt-3" style={{borderTop:"1px solid rgba(255,255,255,.08)"}}>
                  <div className="g-label mb-2">Archetype Weights</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.top.map(t=>(
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{color:"#4ade80",border:"1px solid #4ade8040",background:"#4ade8015"}}>{t}</span>
                    ))}
                    {g.low?.map(t=>(
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{color:"#f87171",border:"1px solid #f8717140",background:"#f8717115"}}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={()=>{setEraInfo(null);setSimEra(eraInfo);startFullSpin();}}
                className="aura-rating-btn w-full" style={{padding:"11px",fontSize:12.5,letterSpacing:".1em"}}>
                Play this era
              </button>
            </div>
          </InfoModal>
        );
      })()}

      {/* === SPIN / FETCHING === Çark artık dock'ta; burada sadece durum satırı */}
      {isSpinPhase&&(
        <p className="text-center text-xs animate-pulse py-10" style={{color:"var(--text-muted)"}}>
          {statusMsg||(phase==="spin_season"?"Picking season…":phase==="spin_team"?"Picking team…":"Loading…")}
        </p>
      )}

      {/* === PICK PLAYER === */}
      {phase==="pick_player"&&(()=>{
        const salary = mode==="salarycap";
        const budgetLeft = salary ? START_BUDGET-totalSpent(Object.values(lineup)) : null;
        const spendCap = salary
          ? (wildcardRef.current ? budgetLeft : maxSpendNow(budgetLeft, emptySlots.length))
          : null;
        let list = posFilter ? players.filter(p=>posGroupOf(p)===posFilter) : players;
        const sorted = [...list].sort((a,b)=>{
          if(sortKey==="TAGGED"){
            const ta=getPlayerTags(a).length, tb=getPlayerTags(b).length;
            if(tb!==ta) return tb-ta;
            return (parseFloat(b.PTS||0)||0)-(parseFloat(a.PTS||0)||0);
          }
          return (parseFloat(b[sortKey]||0)||0)-(parseFloat(a[sortKey]||0)||0);
        });
        return (
          // Desktop'ta panel akıştan çıkarılıyor (lg:absolute inset-0): böylece
          // uzun oyuncu listesi satır yüksekliğini BELİRLEMİYOR — yüksekliği
          // kort veriyor ve havuzun alt hattı her modda kortla hizalı kalıyor.
          // Liste içeride kayıyor. Mobilde normal akışta.
          <div className="flex-1 min-h-0 lg:relative">
          <div className="g-panel g-pool-fill overflow-hidden flex flex-col h-full">
            {/* Üst bar: G/F/C filtre + sayı.
                Takım/sezon artık dock'ta gösteriliyor — burada tekrar etme. */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap shrink-0"
              style={{borderBottom:"1px solid rgba(255,255,255,.07)"}}>
              <span className="g-label">Available</span>
              <span className="ml-auto flex items-center gap-1">
                {["G","F","C"].map(g=>(
                  <button key={g} onClick={()=>setPosFilter(f=>f===g?"":g)}
                    className={`aura-pill-btn${posFilter===g?" active":""}`}
                    style={{padding:"4px 11px",fontSize:11,fontWeight:700}}>
                    {g}
                  </button>
                ))}
              </span>
              <span className="text-[11px] tabular-nums" style={{color:"var(--text-faint)"}}>{sorted.length}</span>
              {/* Rozet lejantı — TAG sütunundaki baş harflerin okunacağı yer */}
              <button onClick={()=>setModal("tags")} title="What the tag badges mean"
                className="g-tile-info"
                style={{position:"static",width:19,height:19,flexShrink:0,"--accent":"#f87171","--accent-line":"rgba(248,113,113,.45)"}}>
                <InfoIcon size={11} />
              </button>
            </div>
            {/* Satır listesi — yatay kaydırmalı (mobil/dar panelde stat'lar kayar,
                isim+arketip+tag'ler solda pinli kalır). Yükseklik artık sabit
                değil: flex-1 ile panelin kalanını doldurur. */}
            <div className="flex-1 min-h-0 overflow-auto">
              {/* Kolon başlıkları */}
              {sorted.length>0&&(
                <div className="g-row-head">
                  <span className="lbl c-pin sticky left-0"
                    style={{background:"linear-gradient(90deg,#0e0c10 82%,transparent)"}}>Player</span>
                  <button onClick={()=>setSortKey("TAGGED")} title="Sort by tag count"
                    className={`lbl c-tag${sortKey==="TAGGED"?" active":""}`}>TAG</button>
                  {salary&&<span className="lbl c-cost">$</span>}
                  {discoverActive&&<span className="lbl c-cost">OVR</span>}
                  {[["PTS","PTS"],["REB","REB"],["AST","AST"],["3P%","FG3_PCT"],["STL","STL"],["BLK","BLK"]].map(([h,f])=>(
                    <button key={h} onClick={()=>setSortKey(f)}
                      className={`lbl c-stat${sortKey===f?" active":""}`}>{h}</button>
                  ))}
                </div>
              )}
              {sorted.map((p,i)=>{
                const c = salary ? priceOf(p) : null;
                const over = salary && c>spendCap;
                return <PlayerRow key={i} player={p} discover={discoverActive}
                  onClick={()=>handlePickPlayer(p)} cost={c} unaffordable={over}
                  highlightStat={sortKey==="TAGGED"?"PTS":sortKey}/>;
              })}
              {sorted.length===0&&(
                <div className="py-8 text-center text-xs" style={{color:"var(--text-faint)"}}>No players in this group — clear the filter.</div>
              )}
            </div>
            {/* Alt bar: sıralama */}
            <div className="flex items-center px-3 py-2 gap-0.5 flex-wrap shrink-0"
              style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <span className="g-label mr-2">Sort</span>
              {SORT_KEYS.map(([field,label])=>(
                <button key={field} onClick={()=>setSortKey(field)}
                  className={`aura-pill-btn${sortKey===field?" active":""}`}
                  style={{padding:"4px 10px",fontSize:10,fontWeight:700,letterSpacing:".06em"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          </div>
        );
      })()}

      {/* === PICK POSITION === */}
      {phase==="pick_pos"&&pickedPlayer&&(()=>{
        const eligible=getEligiblePos(pickedPlayer);
        const primary=eligible[0];
        return (
          <div className="g-panel p-4" style={{"--accent":"#FFB11B","--accent-line":"rgba(255,177,27,.5)"}}>
            <span className="aura-blob" style={{"--slot-color":"#FFB11B",left:"10%",top:-40,width:220,height:120,opacity:0.2}} />
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="font-logo text-[17px] font-bold flex items-center gap-2 flex-wrap" style={{color:"var(--text-primary)"}}>
                  {pickedPlayer.PLAYER_NAME}
                  <span className="text-[11px] font-semibold" style={{color:"#60a5fa"}}>{pickedPlayer.primary_arch||"—"}</span>
                </div>
                <div className="text-xs mt-0.5" style={{color:"var(--text-faint)"}}>{chosenSeason} · {chosenTeam}</div>
                {/* İstatistikler (arketip her zaman açık, overall gizli) */}
                <div className="flex gap-3 mt-1.5">
                  {[["PTS","PTS"],["REB","REB"],["AST","AST"],["FG3_PCT","3P%"]].map(([k,l])=>{
                    const v=pickedPlayer[k];
                    const disp=v==null||isNaN(+v)?"—":k==="FG3_PCT"?`${Math.round(+v*100)}%`:(+v).toFixed(1);
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[13px] font-bold text-white tabular-nums">{disp}</div>
                        <div className="text-[8.5px] uppercase tracking-wide text-gray-600">{l}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 mt-2 flex-wrap items-center">
                  {eligible.map(p=>(
                    <span key={p} className={`text-[9.5px] px-1.5 py-0.5 rounded border font-bold inline-flex items-center gap-0.5 ${POS_COLORS[p]||""}`}>
                      {p}{p===primary&&<StarIcon size={9} />}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={()=>{setPickedPlayer(null);setPhase("pick_player");}}
                className="text-gray-600 hover:text-gray-300 text-xs shrink-0">← Back</button>
            </div>
            {/* Tag'ler büyütülmüş — tam ad + etkisi (oyuncuya tıklayınca ne olduğu net) */}
            {(()=>{ const tg=getPlayerTags(pickedPlayer); return tg.length>0&&(
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {tg.map(t=>(
                  <div key={t.key} className="rounded-lg px-2 py-1.5 flex items-start gap-2"
                    style={{background:t.color+"14",border:`1px solid ${t.color}44`}}>
                    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center text-[10px] font-bold rounded px-1 h-[16px] min-w-[16px]"
                      style={{color:t.color,background:t.color+"22",border:`1px solid ${t.color}66`}}>{t.abbr}</span>
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-bold leading-tight" style={{color:t.color}}>{t.label}</div>
                      <div className="text-[10.5px] text-gray-400 leading-snug">{t.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            ); })()}
            {/* Desktop: court spot'una tıkla; Mobil: butonlar (court yok) */}
            <div className="hidden lg:flex items-center gap-1.5 text-[13px] text-yamabuki mt-1 mb-1">
              <span className="text-base leading-none">↘</span>
              <span>Pick a spot on the court or bench to place <span className="font-semibold">{pickedPlayer.PLAYER_NAME?.split(" ").slice(-1)[0]}</span></span>
            </div>
            <div className="lg:hidden">
            <div className="text-xs text-gray-500 mb-2 inline-flex items-center gap-1 flex-wrap">
              <span>Which position? (</span><StarIcon size={10} /><span>= primary → chemistry bonus · secondary −10%{isFlex(pickedPlayer)?", next-nearest −10% (VERSATILE), rest −25%":", elsewhere −25%"})</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {POSITIONS.filter(p=>!lineup[p]).map(pos=>{
                const isElig=eligible.includes(pos);
                const isPrim=pos===primary;
                const pen=posPenaltyFor(pickedPlayer,pos);
                const penLabel=pen>=1?null:pen>=0.90?"−10%":"−25%";
                const pHex = POS_HEX[pos] || "#9ca3af";
                return (
                  <button key={pos} onClick={()=>handlePickPos(pos)}
                    className="flex-1 min-w-[3rem] py-2.5 rounded-xl font-logo font-bold text-sm transition-all hover:-translate-y-0.5"
                    style={isPrim
                      ? {color:pHex,background:pHex+"1f",border:`1px solid ${pHex}`,boxShadow:`0 0 18px -5px ${pHex}`}
                      : isElig
                        ? {color:"var(--text-primary)",background:"rgba(255,255,255,.04)",border:`1px solid ${pHex}44`}
                        : {color:"var(--text-faint)",background:"transparent",border:"1px dashed rgba(255,255,255,.12)"}}>
                    <div className="inline-flex items-center gap-1 justify-center">{pos}{isPrim&&<StarIcon size={11} />}</div>
                    {penLabel&&<div className="text-[8.5px] font-medium" style={{color:"#f87171"}}>{penLabel}</div>}
                    {!penLabel&&!isPrim&&isFlex(pickedPlayer)&&<div className="text-[8.5px] font-medium" style={{color:"#c084fc"}}>vers.</div>}
                  </button>
                );
              })}
            </div>
            {BENCH_SLOTS.some(b=>!lineup[b])&&(
              <>
                <div className="text-xs text-gray-500 mt-3 mb-2">
                  Or send to the bench — no position penalty, but reduced minutes (~22% of the load)
                </div>
                <div className="flex gap-2">
                  {BENCH_SLOTS.filter(b=>!lineup[b]).map(b=>(
                    <button key={b} onClick={()=>handlePickPos(b)}
                      className="flex-1 py-2.5 rounded-xl font-logo font-bold text-sm transition-all hover:-translate-y-0.5"
                      style={{color:"var(--text-muted)",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.1)"}}>
                      {b}
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        );
      })()}

      {/* === PICK COACH === (vs modlarıyla aynı bileşen — tek kaynak) */}
      {phase==="pick_coach"&&(
        <CoachPicker
          title="Final Step — Draft a Coach"
          options={coachOptions}
          onPick={(c)=>{
            setCoach(c);
            setMoveSrc(null);
            const fit=computeLineupFit(POSITIONS.map(p=>lineupRef.current[p]), simEra);
            setFitResult(fit);
            setPhase("complete");
          }}
        />
      )}

      </div>{/* sol panel sonu */}

      {/* ── SAĞ PANEL: yarım saha (desktop) — setup pane ile hizalı, sabit genişlik ── */}
      <div className="hidden lg:block min-w-0">
        <div className="sticky top-2">
          <CourtBoard lineup={lineup} coach={coach} moveSrc={moveSrc}
            canRearrange={canRearrange} onSlotTap={handleSlotTap} getPrimaryPos={getPrimaryPos}
            placing={phase==="pick_pos"&&!!pickedPlayer}
            placingEligible={pickedPlayer?getEligiblePos(pickedPlayer):[]}
            placingPenalties={pickedPlayer?Object.fromEntries(POSITIONS.map(p=>[p,posPenaltyFor(pickedPlayer,p)])):{}}
            onPlace={handlePickPos}/>
        </div>
      </div>

      </div>
      )}

      {/* === COMPLETE === */}
      {phase==="complete"&&fitResult&&(
        <div className="max-w-3xl mx-auto space-y-3">
          <ScoreReveal fit={fitResult} lineup={lineup} primaryCount={primaryCount} onReset={resetGame} lang={lang} affinityMatrix={affinityMatrix} simEra={simEra} coach={coach} mode={mode}/>
        </div>
      )}
    </div>
    </div>
  );
}
