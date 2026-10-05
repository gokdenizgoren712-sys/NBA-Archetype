import { useState, useEffect, useRef } from "react";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB, ERA_HEX } from "../game/eras";
import { computePlayerFit, computeAffinity } from "../game/lineupScore";
import { useSeasonSim } from "../game/useSeasonSim";
import ResultStage from "../game/ui/ResultStage";
import SeasonResult from "../game/ui/SeasonResult";
import CourtBoard from "../game/CourtBoard";
import { StarIcon, EyeIcon, LinkIcon, CheckIcon, DownloadIcon, XLogoIcon } from "../game/GameIcons";
import { POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos } from "../game/positions";
import SetupHub from "../game/ui/SetupHub";
import GameStage from "../game/ui/GameStage";
import EraStep from "../game/ui/EraStep";
import BasketballDraft from "../game/ui/BasketballDraft";
import ModeAboutModal from "../game/ModeAboutModal";
import { PageGlow } from "../components/states/States";
import CoachPicker from "../game/CoachPicker";
import DraftAnalysis from "../game/DraftAnalysis";
import LeaderboardPanel from "../game/LeaderboardPanel";
import { apiUrl } from "../lib/apiOrigin";
import { useLineupDraft } from "../game/useLineupDraft";
import { finalScore } from "../game/draftScore";
import "../game/game.css";

// Not: aşağıdaki hex haritaları CSS custom property'lere (accent / glow) besleniyor;
// Tailwind sınıfı ile alfa-suffix birleştirilemediği için gerçek hex gerekiyor.
const GRADE_HEX = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
const POS_HEX   = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };
// Pillar/kalite barları için sürekli kalite skalası (Lineups sayfasıyla aynı).
const VAL_HEX = (v) => v >= 0.75 ? "#4ade80" : v >= 0.55 ? "#facc15" : v >= 0.40 ? "#fb923c" : "#f87171";
// Paylaşım kartı canvas'ı DOM dışında çizildiği için var(--accent) kullanamıyor;
// index.css :root'taki var(--accent)/var(--yamabuki) ile aynı tutulmalı.
const ACCENT_HEX = "#FFB11B";

// ── Skorlama çekirdeği ────────────────────────────────────────────────────────
// computePlayerFit / computeLineupFit / computeAffinity → game/lineupScore.js'e
// taşındı (v3.9 / G3): UI ve headless backtest (scripts/backtest.mjs) aynı saf
// mantığı tek kaynaktan kullanır.

// ── Era sistemi — src/game/eras.js'ten import edilir ─────────────────────────
// (Era Fit paneli v3.6'da kaldırıldı; Faz B'de era etkisi dönem-uzaklığına taşınacak)

// ── Sonuç ekranı ──────────────────────────────────────────────────────────────
function ScoreReveal({ fit, lineup, primaryCount, onReset, lang, affinityMatrix, simEra, coach, mode="classic" }) {
  const { isLoggedIn, token } = useAuth();
  // Puan ve not ortak kaynaktan (game/draftScore.js): uygulama da aynı tabloya yazıyor.
  const { chemBonus, pct, grade } = finalScore(fit, primaryCount);

  // Archetype affinity score — v3.8: her oyuncunun TOP-3 arketibinin ağırlıklı
  // profili üzerinden (sadece birincil arketip değil). Çift affinity'si iki
  // oyuncunun tüm arketip-çifti kombinasyonlarının ağırlıklı ortalamasıdır.
  const affinityScore = (() => {
    const a = computeAffinity(POSITIONS.map(p => lineup[p]), affinityMatrix);
    return a == null ? null : Math.round(a * 100);
  })();

  const [leaderboard, setLeaderboard] = useState(null);
  const [gameScoreId, setGameScoreId] = useState(null);

  // Auto-save score (once on mount, if logged in). savedOnceRef guards against
  // React StrictMode's dev-only double-invoke of mount effects — without it,
  // two rows got inserted per game and /api/game/season-result's old
  // "update the user's last row" fallback only ever finished one of them,
  // leaving a permanent orphaned (blank wins/result) duplicate on the board.
  const savedOnceRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || !token) return;
    if (savedOnceRef.current) return;
    savedOnceRef.current = true;
    const filled = ALL_SLOTS.map(p => lineup[p]).filter(Boolean);
    const players = filled.map(p => p.PLAYER_NAME);
    // Faz 4 (Board Challenge): salarycap kadroları roster_json'a da yazılmalı,
    // yoksa Board hiçbir zaman dolmaz — lineup[p] zaten /api/game/players'ın
    // döndürdüğü tam satır (primary_arch/overall_score/score_*) + pick sırasında
    // eklenen _season/_cost/_posPenalty'yi taşıyor, ek bir fetch gerekmiyor.
    const roster = mode === "salarycap" && filled.length === ALL_SLOTS.length ? filled : [];
    fetch(apiUrl("/api/game/score"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pct, grade, lineup: players, mode, roster }),
    })
      .then(r => r.json())
      .then(d => { if (d?.id != null) setGameScoreId(d.id); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaderboard — mod bazlı
  useEffect(() => {
    fetch(apiUrl(`/api/leaderboard?limit=100&mode=${mode}`)).then(r => r.json())
      .then(d => setLeaderboard({ entries: d.entries || [], total: d.total ?? null })).catch(() => {});
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
    fetch(apiUrl("/api/rosters"), {
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

  // Tablonun referansı (brief: çıplak sayı yok). Bu bir persantil DEĞİL —
  // 100 üzerinden Lineup Fit puanı; sıra, kayıtlı koşular içinde nereye
  // düştüğü (ilk 100'ün içindeyse).
  const modeLabel = mode === "salarycap" ? "Salary Cap" : "Classic";
  const rank = leaderboard ? leaderboard.entries.filter(e => e.pct > pct).length + 1 : null;
  const refLine = leaderboard == null ? null
    : leaderboard.total
      ? (rank <= leaderboard.entries.length || leaderboard.entries.length < 100
          ? <>Would place <b>#{rank}</b> of {leaderboard.total.toLocaleString()} {modeLabel} runs on record</>
          : <>Below the top 100 of {leaderboard.total.toLocaleString()} {modeLabel} runs on record</>)
      : <>No {modeLabel} runs on the board yet</>;

  const gHex = GRADE_HEX[grade] || "#9ca3af";
  const parts = [
    ["Quality",   qualityPct,                    "45%"],
    ["Coverage",  coveragePct,                   "40%"],
    ["Chemistry", Math.round(fit.roleFit * 100), "15%"],
  ];
  const [shareOpen, setShareOpen] = useState(false);

  // Sezon motoru burada kurulur: rotasyon sonuç sayfasında düzenleniyor, sezon aynı motorla oynanıyor.
  const starters = POSITIONS.map(p => lineup[p]).filter(Boolean);
  const benchPlayers = BENCH_SLOTS.map(p => lineup[p]).filter(Boolean);
  const sim = useSeasonSim({
    players: starters, bench: benchPlayers, simEra: simEra || ERAS[5], fit, coach,
    affinity01: affinityScore != null ? affinityScore / 100 : null, gameScoreId, isLoggedIn, token,
  });

  const saveUI = saveStatus === "saved" ? (
    <span className="sb-fres-note">Roster saved — find it on your Profile page.</span>
  ) : (
    <div className="sb-fres-save">
      <label htmlFor="save-roster">Save this roster</label>
      <input id="save-roster" type="text" value={saveName} maxLength={60}
        onChange={e => setSaveName(e.target.value)} placeholder="e.g. Fear the Deer 2011"
        className="aura-ghost-input" />
      <button type="button" onClick={saveRoster} disabled={saveStatus === "saving" || !saveName.trim()}
        className="pa-btn-secondary">{saveStatus === "saving" ? "Saving…" : "Save"}</button>
      {saveErr && <p className="sb-fres-note">{saveErr}</p>}
    </div>
  );

  return (
    <>
      {sim.stage === "idle" ? (
        <ResultStage fit={fit} simEra={simEra || ERAS[5]} grade={grade} pct={pct} refLine={refLine}
          chemBonus={chemBonus} primaryCount={primaryCount} lineup={lineup} sim={sim} enableRealHistory
          saveUI={saveUI} loggedIn={isLoggedIn} onShare={() => setShareOpen(true)} onReset={onReset} />
      ) : (
        <SeasonResult sim={sim} players={starters} bench={benchPlayers} onReset={onReset}
          extra={
            <>
              <DraftAnalysis simEra={simEra} affinity={affinityScore} showHero={false} showParts={false}
                label="Draft analysis" teams={[{ name: "Your Roster", lineup, coach }]} />
              <div className="sb-res-actions">
                <div className="save">{isLoggedIn ? saveUI : <span className="note">Sign in to save rosters and land on the board.</span>}</div>
                <button type="button" className="sb-btn" onClick={() => setShareOpen(true)}>Share card</button>
              </div>
            </>
          } />
      )}

      {shareOpen && (
        <div className="g-rules-backdrop" onClick={() => setShareOpen(false)}>
          <div className="g-rules" style={{ "--accent": gHex }} onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Share your result">
            <div className="g-rules-head">
              <div><div className="g-rules-eyebrow">Share</div><h2 className="g-rules-title">Your card</h2></div>
              <button className="g-rules-close" onClick={() => setShareOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="g-rules-body">
              <ShareCard pct={pct} grade={grade} fit={fit} lineup={lineup} simEra={simEra} coach={coach} />
            </div>
          </div>
        </div>
      )}
    </>
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
  // GRADE_HEX/POS_HEX/VAL_HEX (module scope, üstte) ile birebir aynıydı — tekilleştirildi.

  // Logo işareti — favicon.svg ile birebir aynı geometri (12-gen + dikiş
  // çizgileri). Kartın hem üstünde hem sağ alt imzasında kullanılıyor.
  const drawMark = (ctx, cx, cy, size) => {
    const s = size / 48, r = (x, y) => [cx + (x - 24) * s, cy + (y - 24) * s];
    const pts = [[24,4],[34,6.7],[41.3,14],[44,24],[41.3,34],[34,41.3],[24,44],[14,41.3],[6.7,34],[4,24],[6.7,14],[14,6.7]];
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = ACCENT_HEX; ctx.lineWidth = 4 * s;
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

    const gHex = GRADE_HEX[grade] || "#9ca3af";
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
    glow2.addColorStop(0, ACCENT_HEX + "22"); glow2.addColorStop(1, ACCENT_HEX + "00");
    ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

    // Nokta matrisi (.g-dotgrid)
    ctx.fillStyle = "rgba(255,255,255,.045)";
    for (let x = 14; x < W; x += 17) for (let y = 14; y < H; y += 17) ctx.fillRect(x, y, 1, 1);

    // Holo şeritler (.g-holo) — çok düşük opaklık, 72°
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = ACCENT_HEX; ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 26) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H * 0.32, H); ctx.stroke();
    }
    ctx.restore();

    // Çerçeve + üst accent şeridi
    ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.fillStyle = ACCENT_HEX; ctx.fillRect(0, 0, W, 3);

    // ── Üst bar: logo + isim | era ──
    drawMark(ctx, P + 13, P + 8, 30);
    font(700, 23); ctx.fillStyle = ACCENT_HEX;
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
      ["CHEMISTRY", Math.round((fit.roleFit || 0) * 100), "15%"],
    ];
    parts.forEach(([label, v, w], i) => {
      const x = W - P - (2 - i) * 132 - 96;
      font(700, 40); ctx.fillStyle = VAL_HEX(v / 100);
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
      const hex = isBench ? "#6b7280" : (POS_HEX[slot] || "#9ca3af");
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
      font(700, 19); ctx.fillStyle = isBench ? TXT.muted : VAL_HEX(q / 100);
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
      ctx.fillStyle = VAL_HEX(v / 100);
      ctx.beginPath(); ctx.roundRect(x, pillY + 10, (colW - 26) * (v / 100), 8, 4); ctx.fill();
      font(700, 17); ctx.fillStyle = VAL_HEX(v / 100);
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
    font(700, 16); ctx.fillStyle = ACCENT_HEX;
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
    <div className="space-y-3">

      {/* Preview */}
      {preview ? (
        <div className="rounded-xl overflow-hidden">
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
            className="h-11 rounded-[11px] text-[14px] font-medium transition-all inline-flex items-center justify-center gap-1.5"
            style={{ color, background: color + "14" }}
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
// Hub adımları ve kural setleri (mockup 3a). Metin final; açıklamaların tamamı
// mod kartındaki Rules pop-up'ında (ModeAboutModal) tek kaynaktan anlatılıyor.
const DRAFT_STEPS = [
  { n: "1", t: "Pick era",       d: "Distance & style fit" },
  { n: "2", t: "Spin & draft 9", d: "5 starters + 4 bench" },
  { n: "3", t: "Hire coach",     d: "Offense & defense grades" },
  { n: "4", t: "Simulate 82",    d: "Playoffs & awards glory" },
];

const DRAFT_PHASES = ["await_spin", "spin_season", "spin_team", "fetching", "pick_player", "pick_pos"];

const RULESETS = [
  { key: "classic",   label: "Classic",    hint: "Pure luck" },
  { key: "salarycap", label: "Salary Cap", hint: "100% cap" },
];

export default function LineupGame() {
  const { lang } = useLang();

  // Oyunun kuralları ortak motorda (game/lineupDraft.js): RankIt uygulamasının
  // mobil arayüzü de aynısını kullanıyor, ikisi aynı skor tablosuna yazıyor.
  const draft = useLineupDraft({ autoSpin: false, spinMs: 1100, jokerSpinMs: 1500 });
  const {
    phase, simEra, mode, coach, coachOptions, seasons,
    players, lineup, fitResult, moveSrc, jokers, affinityMatrix,
    filledSlots, primaryCount, canRearrange, setMode, beginEraPick, chooseEra,
    randomEra, pickCoach,
    pickPos: handlePickPos, slotTap: handleSlotTap, reset: resetGame,
  } = draft;
  const [rules, setRules] = useState(null); // (i) kural penceresi
  // Info modals

  return (
    <div className="h-full overflow-y-auto">
    <SEO
      title="Lineup Builder Game"
      description="Build the greatest 5-man lineup in NBA history. Pick players from any era — 1983 to today — and see how well your roster fits together across archetypes and eras."
      path="/basketball/game/single"
    />
    {phase==="idle" ? (
      <SetupHub sport="basketball" title="Lineup builder"
        subtitle="Draft 9 players: 5 starters, 4 bench. Then hire a coach."
        rules={RULESETS} ruleKey={mode} onRule={setMode}
        startLabel={seasons.length===0?"Loading…":mode==="salarycap"?"Start cap draft":"Start draft"}
        onStart={beginEraPick} startDisabled={seasons.length===0}
        steps={DRAFT_STEPS} total={ALL_SLOTS.length}
        leaderboard={<LeaderboardPanel mode={mode} limit={25} />} />
    ) : phase==="pick_era" ? (
      <EraStep eras={ERAS} blurbs={ERA_META_BLURB} onChoose={chooseEra} onRandom={randomEra} />
    ) : DRAFT_PHASES.includes(phase) ? (
      <>
        <BasketballDraft draft={draft} onInfo={() => setRules({ key: "single", title: "Spin & Build", accent: "#FFB11B" })} />
        <ModeAboutModal mode={rules} onClose={() => setRules(null)} />
      </>
    ) : phase==="pick_coach" ? (
      <GameStage sport="basketball">
        <CoachPicker sport="basketball" title="Hire your coach" options={coachOptions} onPick={pickCoach} />
      </GameStage>
    ) : phase==="complete"&&fitResult ? (
      <ScoreReveal fit={fitResult} lineup={lineup} primaryCount={primaryCount} onReset={resetGame} lang={lang} affinityMatrix={affinityMatrix} simEra={simEra} coach={coach} mode={mode}/>
    ) : null}
    </div>
  );
}
